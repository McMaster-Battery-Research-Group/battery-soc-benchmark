function Evaluate_Submission(zipPath, outDir, toolDir)
% EVALUATE_SUBMISSION  Headless entry point for the web platform.
%
%   Evaluate_Submission(zipPath, outDir, toolDir)
%
% Runs the lab's Standardized Evaluation Tool on one submission package and
% writes <outDir>/results.json for the website worker. It reuses the lab's
% functions unchanged (Validate_Submission, Obtain_Output_Data, Create_Figures)
% and reproduces the scoring block of Process_Submission.m, but does NOT send
% email, touch Leaderboard.csv, or keep copies of the package — the website
% owns those responsibilities.
%
% Called by the worker as:
%   matlab -batch "addpath('<repo>/matlab'); Evaluate_Submission('<pkg.zip>','<out>','<toolDir>')"
%
% Environment:
%   SOCBENCH_PYTHON   path to the python.exe of the env with numpy/scipy
%                     (only needed for Model.py submissions; see IterateAll.m)
%
% Exit status: 0 on success (results.json written), non-zero on failure with
% <outDir>/error.json describing the problem.

    t0 = tic;
    if nargin < 3 || isempty(toolDir), toolDir = getenv('SOCBENCH_TOOL_DIR'); end
    if isempty(toolDir), error('toolDir (or SOCBENCH_TOOL_DIR) is required'); end
    if ~isfolder(outDir), mkdir(outDir); end
    errFile = fullfile(outDir, 'error.json');
    if isfile(errFile), delete(errFile); end

    addpath(toolDir);
    if exist('gcp', 'file') ~= 2                      % no Parallel Computing Toolbox → serial fallback
        addpath(fullfile(fileparts(mfilename('fullpath')), 'shims'));
        log('Parallel Computing Toolbox not found — running cycles serially (no per-cycle watchdog)');
    end
    rootfolder = toolDir; %#ok<NASGU>
    workDir = fullfile(outDir, 'pkg');
    if isfolder(workDir), rmdir(workDir, 's'); end
    mkdir(workDir);
    cleanup = onCleanup(@() localCleanup(workDir)); %#ok<NASGU>

    try
        %% ---- constants (identical to Standardized_Evaluation_Tool_V2.m)
        Inputs = {'Current', 'Voltage', 'Battery_Temp_degC'};
        Setups = {'m80', 'm448', 'm448N', 'm1000'};
        Normal_cycles = 4;
        Custom_cycles = 2;
        Temperatures = {'-20$^o$C','-10$^o$C', '0$^o$C', '10$^o$C', '25$^o$C', '40$^o$C'};
        Weights = [0 1/10 1/10 1/10 1/30 2/30 2/30 1/30 1/10 1/10 1/60 1/60 1/60 1/60 1/60 1/60 1/10 1/10];
        set(groot,'DefaultTextInterpreter','latex');
        set(groot,'DefaultAxesTickLabelInterpreter','latex');
        set(groot,'DefaultLegendInterpreter','latex');
        set(groot,'DefaultFigureVisible','off');

        %% ---- blinded data (never leaves toolDir)
        S = load(fullfile(toolDir,'Data_m80.mat'));   Data(1) = S.Data_m80;
        S = load(fullfile(toolDir,'Data_m448.mat'));  Data(2) = S.Data_m448;
        S = load(fullfile(toolDir,'Data_m448N.mat')); Data(3) = S.Data_m448N;
        S = load(fullfile(toolDir,'Data_m1000.mat')); Data(4) = S.Data_m1000;
        clear S;

        %% ---- unpack + structural checks
        unzip(zipPath, workDir);
        addpath(workDir);
        hasModel = isfile(fullfile(workDir,'Model.m')) || isfile(fullfile(workDir,'Model.p')) || isfile(fullfile(workDir,'Model.py'));
        if ~hasModel, fail('FORMAT', 'No Model.m, Model.p or Model.py at the top level of the archive.'); end
        xl = dir(fullfile(workDir,'*.xlsx'));
        settings = struct('authorName','','affiliation','','email','','modelName','');
        if ~isempty(xl)
            C = readcell(fullfile(workDir, xl(1).name));
            if size(C,1) >= 4 && size(C,2) >= 2
                settings.authorName  = str(C{1,2}); settings.affiliation = str(C{2,2});
                settings.email       = str(C{3,2}); settings.modelName   = str(C{4,2});
            end
        end
        if isfile(fullfile(workDir,'Model.py')) && isempty(getenv('SOCBENCH_PYTHON'))
            fail('CONFIG', 'Model.py submissions require SOCBENCH_PYTHON to point at a Python with numpy + scipy.');
        end

        %% ---- validation (same as the daemon: 10 °C UDDS with +0.3 A offset)
        log('validating on 10 C UDDS with +0.3 A current offset');
        evalc('failed = Validate_Submission(Data, {settings.email});');
        if failed, fail('VALIDATION', 'The model raised an error during the validation run (10 C UDDS, +0.3 A offset). Run the Model Submission Test Tool locally to reproduce.'); end

        %% ---- full evaluation
        log('running all blinded cycles');
        [OutputData, RMSE, MAXE, MAE, RMSE_Charge, File, Complexity] = Obtain_Output_Data(Setups, Data, Inputs);
        suspicious = mean(mean(RMSE)) > 25;

        figDir = fullfile(outDir, 'figures'); if ~isfolder(figDir), mkdir(figDir); end
        here = cd(figDir);
        log('robustness sweeps + figures');
        [mean_RMSE_temp, RMSE_SOC_Offset, RMSE_Sens_Offset] = Create_Figures(OutputData, Inputs, Data, File, figDir, RMSE, Temperatures);
        cd(here);

        %% ---- scoring (verbatim logic from Process_Submission.m)
        RMSE_Results = zeros(10,1);
        RMSE_means = [mean(RMSE(:,1)), mean(RMSE(:,2)), mean(RMSE(:,3)), mean(RMSE(:,4))];
        RMSE_Results(1) = mean(nonzeros(RMSE));
        RMSE_Results(2) = RMSE_means(2);
        RMSE_Results(3) = mean([RMSE_means(1), RMSE_means(3), RMSE_means(4)]);
        RMSE_Results(4) = mean(nonzeros(RMSE_Charge));
        RMSE_Results(5:8) = RMSE_means(1:4);
        Standard_RMSE = []; Custom_RMSE = [];
        for i = 1:(Normal_cycles+Custom_cycles):length(RMSE)
            Standard_RMSE = [Standard_RMSE; RMSE(i:i+3,:)]; %#ok<AGROW>
            Custom_RMSE   = [Custom_RMSE;   RMSE(i+4:i+5,:)]; %#ok<AGROW>
        end
        Standard_means = [mean(Standard_RMSE(:,1)), mean(Standard_RMSE(Standard_RMSE(:,2)~=0,2)), mean(Standard_RMSE(:,3)), mean(Standard_RMSE(:,4))];
        Custom_means   = [mean(Custom_RMSE(:,1)),   mean(Custom_RMSE(Custom_RMSE(:,2)~=0,2)),     mean(Custom_RMSE(:,3)),   mean(Custom_RMSE(:,4))];
        RMSE_Results(9)  = mean(Standard_means);
        RMSE_Results(10) = mean(Custom_means);
        RMSE_SOC_weighted = [];
        for i = 0:3:length(RMSE_SOC_Offset)-3
            for j = 1:3
                RMSE_SOC_weighted = [RMSE_SOC_weighted; repmat(RMSE_SOC_Offset(i+j), 3-(j-1), 1)]; %#ok<AGROW>
            end
        end
        RMSE_Sens_relevant = RMSE_Sens_Offset([1 6 7 12 13 18]);
        Scores = [RMSE_Results(1:10)', mean_RMSE_temp(1:6), mean(RMSE_SOC_weighted), mean(RMSE_Sens_relevant)];
        Final_Score = sum(Weights .* Scores);

        %% ---- complexity "n-1,n,n+1" -> n
        cparts = str2double(split(string(Complexity), ','));
        complexity = cparts(2);

        %% ---- per-cycle rows + downsampled time series
        perCycle = {}; timeSeries = {};
        cellNames = {'m80','m448','m448-N','m1000'};
        for t = 1:4
            T = OutputData.(Setups{t});
            names = T.Properties.RowNames;
            for r = 1:height(T)
                cyc = regexprep(names{r}, '_\d+$', '');                 % table row suffix
                cyc = regexprep(cyc, '^(HWCUST|HWGRADE|REORDERED)\d+$', '$1'); % run number → family (matches Python evaluator)
                act = double(T{r,5}.Data(:)); est = double(T{r,6}.Data(:));
                row = struct('cell', cellNames{t}, 'cycle', cyc, 'temperatureC', double(T{r,1}), ...
                    'rmse', double(T{r,2}), 'mae', double(T{r,3}), 'maxErr', double(T{r,4}), 'durationH', numel(act)/3600);
                perCycle{end+1} = row; %#ok<AGROW>
                if wantTrace(cellNames{t}, cyc, double(T{r,1}))
                    idx = unique(round(linspace(1, numel(act), min(240, numel(act)))));
                    ts = struct('key', sprintf('%s-%s-%d', cellNames{t}, cyc, double(T{r,1})), ...
                        'label', sprintf('%s %s at %d °C', cellNames{t}, cyc, double(T{r,1})), ...
                        'cell', cellNames{t}, 'cycle', cyc, 'temperatureC', double(T{r,1}), ...
                        't', round((idx-1)/3600, 3), 'actual', round(100*act(idx), 2), 'estimated', round(100*est(idx), 2));
                    timeSeries{end+1} = ts; %#ok<AGROW>
                end
            end
        end

        %% ---- results.json (field names match the website's EvaluationOutput)
        R = struct();
        R.evaluatorVersion   = 'matlab-set-v2';
        R.settings           = settings;
        R.suspicious         = suspicious;
        R.weightedError      = round(Final_Score, 3);
        R.complexity         = complexity;
        R.complexityUncertainty = 1;
        R.complexityRaw      = string(Complexity);
        R.allCells           = round(Scores(1), 3);
        R.blindedCell        = round(Scores(2), 3);
        R.nonBlindedCells    = round(Scores(3), 3);
        R.charging           = round(Scores(4), 3);
        R.massM80            = round(Scores(5), 3);
        R.massM448           = round(Scores(6), 3);
        R.massM448N          = round(Scores(7), 3);
        R.massM1000          = round(Scores(8), 3);
        R.standardCycles     = round(Scores(9), 3);
        R.nonStandardCycles  = round(Scores(10), 3);
        R.tempM20 = round(Scores(11),3); R.tempM10 = round(Scores(12),3); R.temp0 = round(Scores(13),3);
        R.temp10  = round(Scores(14),3); R.temp25  = round(Scores(15),3); R.temp40 = round(Scores(16),3);
        R.initialSocError    = round(Scores(17), 3);
        R.currentSensorOffset= round(Scores(18), 3);
        R.maxError           = round(max(nonzeros(MAXE)), 3);
        R.meanMae            = round(mean(nonzeros(MAE)), 3);
        R.meanMaxe           = round(mean(nonzeros(MAXE)), 3);
        R.robustness = struct('initialSocRmse', RMSE_SOC_Offset, 'currentOffsetRmse', RMSE_Sens_Offset);
        R.perCycle   = perCycle;
        R.timeSeries = timeSeries;
        R.figures    = cellfun(@(f) f.name, num2cell(dir(fullfile(figDir,'*.fig'))), 'UniformOutput', false);
        R.elapsedSec = round(toc(t0));
        fid = fopen(fullfile(outDir,'results.json'), 'w'); fwrite(fid, jsonencode(R), 'char'); fclose(fid);
        log(sprintf('done in %.0f s — weighted error %.3f', toc(t0), Final_Score));
    catch ME
        E = struct('code', 'RUNTIME', 'message', ME.message, 'stack', {arrayfun(@(s) sprintf('%s:%d', s.name, s.line), ME.stack(1:min(8,end)), 'UniformOutput', false)});
        if startsWith(ME.identifier, 'SOCBENCH:')
            E.code = extractAfter(ME.identifier, 'SOCBENCH:');
        end
        fid = fopen(errFile, 'w'); fwrite(fid, jsonencode(E), 'char'); fclose(fid);
        fprintf(2, 'EVALUATION FAILED [%s]: %s\n', E.code, ME.message);
        exit(1);
    end
end

function fail(code, msg)
    error(['SOCBENCH:' code], '%s', msg);
end

function log(msg)
    fprintf('[%s] %s\n', datestr(now,'HH:MM:SS'), msg);
end

function s = str(v)
    if ismissing(v), s = ''; elseif isnumeric(v), s = num2str(v); else, s = char(string(v)); end
end

function tf = wantTrace(cellName, cyc, tempC)
    % Keep the same representative traces the website shows for the mock evaluator.
    keep = {'m80','UDDS',-20; 'm80','UDDS',0; 'm80','UDDS',40; 'm80','US06',25; ...
            'm1000','HWFET',25; 'm1000','HWCUST',25; 'm1000','HWGRADE',25; 'm448','LA92',10};
    tf = false;
    for k = 1:size(keep,1)
        if strcmp(keep{k,1}, cellName) && startsWith(cyc, keep{k,2}) && keep{k,3} == tempC, tf = true; return; end
    end
end

function localCleanup(d)
    try, rmpath(d); catch, end
    if isfolder(d), try, rmdir(d, 's'); catch, end, end
end
