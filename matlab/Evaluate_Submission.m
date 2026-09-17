function Evaluate_Submission(pkgPath, dataMat, outDir, varargin)
% EVALUATE_SUBMISSION  One MATLAB script that evaluates a MATLAB or Python package.
%
%   Evaluate_Submission(pkg, blind_data.mat, outDir, 'Mode', m, 'Python', exe)
%
% pkg     : a .zip (Model.m / Model.p / Model.py + parameter files at the top level) or a folder
% dataMat : blind_data.mat as written by matlab/Export_Blind_Data.m
% outDir  : results.json (and error.json on failure) are written here
% Mode    : how a Model.py is executed — 'runner' (one Python process for all matrices, default),
%           'percycle' (a new Python process per matrix, the original tool's behaviour),
%           'bridge' (MATLAB's in-process py. interface). MATLAB packages always run natively.
% Python  : python executable for 'runner' / 'percycle' (default: SOCBENCH_PYTHON, then 'python')
%
% Scoring is a line-for-line port of evaluator/python/socbench_eval/pipeline.py (itself a port of
% the lab's Process_Submission.m). The 18 metrics, weighted error, per-cycle rows and complexity
% bin are identical across languages by construction; the only language-specific step is how the
% predictions are obtained.

    opts = parse(varargin);
    t0 = tic; timing = struct();
    if ~isfolder(outDir), mkdir(outDir); end
    errFile = fullfile(outDir, 'error.json'); if isfile(errFile), delete(errFile); end
    workDir = '';
    try
        %% ---- package
        if isfolder(pkgPath)
            pkgDir = pkgPath;
        else
            workDir = fullfile(outDir, 'pkg'); if isfolder(workDir), rmdir(workDir, 's'); end
            mkdir(workDir); unzip(pkgPath, workDir); pkgDir = workDir;
        end
        hasPy = isfile(fullfile(pkgDir, 'Model.py'));
        hasM  = isfile(fullfile(pkgDir, 'Model.m')) || isfile(fullfile(pkgDir, 'Model.p'));
        if hasPy, runtime = 'python'; elseif hasM, runtime = 'matlab';
        else, fail('FORMAT', 'No Model.py, Model.m or Model.p at the top level of the package.'); end
        mode = 'native'; if hasPy, mode = opts.Mode; end
        say(sprintf('runtime: %s (%s)', runtime, mode));

        %% ---- data
        tl = tic; say('loading blinded data');
        S = load(dataMat); data = S.blind; clear S;
        timing.loadSec = toc(tl);

        %% ---- jobs (identical construction to pipeline.build_jobs)
        tb = tic;
        [jobs, vjob, meta] = build_jobs(data);
        timing.buildSec = toc(tb);

        %% ---- model execution
        runner = make_runner(runtime, mode, pkgDir, opts);
        tv = tic; say('validation: m80 UDDS @ 10C, +0.3 A');
        [~, ~, err] = runner({vjob.X});
        if ~isempty(err), fail('VALIDATION', sprintf('The model raised an error during the validation run (10 C UDDS, +0.3 A offset): %s', err)); end
        timing.validateSec = toc(tv);

        tr = tic; say(sprintf('running %d input matrices (blinded cycles + robustness sweeps)', numel(jobs)));
        Xs = cell(numel(jobs), 1); for k = 1:numel(jobs), Xs{k} = jobs(k).X; end
        [raw, secs, err] = runner(Xs);
        if ~isempty(err), fail('RUNTIME', err); end
        timing.runSec = toc(tr);
        preds = struct('key', {}, 'soc', {}, 'secs', {}, 'n', {});
        for k = 1:numel(jobs)
            y = double(raw{k}(:)); y = y(jobs(k).pad + 1:end); y(isnan(y)) = 0;
            preds(k) = struct('key', jobs(k).key, 'soc', y, 'secs', secs(k), 'n', numel(raw{k}));
        end
        P = containers.Map({preds.key}, num2cell(1:numel(preds)));

        %% ---- scoring (pipeline.score)
        ts = tic;
        [s, rows] = score(data, preds, P, meta);
        cal = struct('python', opts.CalPython, 'matlab', opts.CalMatlab);
        [cat, tSample] = complexity(preds, runtime, cal);
        timing.scoreSec = toc(ts);

        R = struct();
        R.evaluatorVersion = sprintf('socbench-matlab-0.1/%s', runtime);
        R.runtime = runtime; R.mode = mode;
        f = fieldnames(s); for i = 1:numel(f), R.(f{i}) = s.(f{i}); end
        R.complexity = cat; R.complexityUncertainty = 1; R.complexityRaw = sprintf('%d,%d,%d', cat - 1, cat, cat + 1);
        R.secondsPerSample = tSample;
        R.perCycle = rows;
        timing.totalSec = toc(t0); R.timing = timing; R.elapsedSec = round(timing.totalSec);
        fid = fopen(fullfile(outDir, 'results.json'), 'w'); fwrite(fid, jsonencode(R), 'char'); fclose(fid);
        say(sprintf('done in %.0f s — weighted error %.3f', timing.totalSec, R.weightedError));
    catch ME
        code = 'RUNTIME'; if startsWith(ME.identifier, 'SOCBENCH:'), code = extractAfter(ME.identifier, 'SOCBENCH:'); end
        E = struct('code', code, 'message', ME.message);
        fid = fopen(errFile, 'w'); fwrite(fid, jsonencode(E), 'char'); fclose(fid);
        fprintf(2, 'EVALUATION FAILED [%s]: %s\n', code, ME.message);
        if ~isempty(workDir) && isfolder(workDir), try, rmdir(workDir, 's'); catch, end, end
        exit(1);
    end
    if ~isempty(workDir) && isfolder(workDir), try, rmdir(workDir, 's'); catch, end, end
end

%% ===================================================================== jobs
function [jobs, vjob, meta] = build_jobs(data)
    PAD = 3600;
    keys = {'m80', 'm448', 'm448N', 'm1000'};
    isocCycles = {'LA92', 25; 'US06', -10; 'US06', 10};          % m80
    isocs = [0.90 0.60 0.30];
    offCycles = {'US06', -10; 'HWFET', 10; 'LA92', 40};          % m1000
    offsets = [-0.3 -0.1 -0.05 0.05 0.1 0.3];
    jobs = struct('key', {}, 'X', {}, 'pad', {});
    for c = 1:numel(keys)
        cyc = cell_of(data, keys{c});
        for i = 1:numel(cyc)
            jobs(end + 1) = struct('key', sprintf('cycle:%s:%d', keys{c}, i - 1), 'X', build_input(Xof(cyc(i)), 0, 0, PAD), 'pad', PAD); %#ok<AGROW>
        end
    end
    m80 = cell_of(data, 'm80'); m1000 = cell_of(data, 'm1000');
    meta.isocIdx = zeros(3, 3); meta.isocCyc = zeros(3, 1); meta.offCyc = zeros(3, 1);
    for b = 1:3
        ci = find_cycle(m80, isocCycles{b, 1}, isocCycles{b, 2}); meta.isocCyc(b) = ci;
        for q = 1:3
            idx = find(m80(ci).SOC(:) < isocs(q), 1) - 1; if isempty(idx), idx = 0; end   % 0-based like np.argmax
            meta.isocIdx(b, q) = idx;
            jobs(end + 1) = struct('key', sprintf('isoc:%d:%d:%d', b - 1, q - 1, idx), 'X', build_input(Xof(m80(ci)), 0, idx, PAD), 'pad', PAD); %#ok<AGROW>
        end
    end
    for b = 1:3
        ci = find_cycle(m1000, offCycles{b, 1}, offCycles{b, 2}); meta.offCyc(b) = ci;
        for j = 1:6
            jobs(end + 1) = struct('key', sprintf('offset:%d:%d', b - 1, j - 1), 'X', build_input(Xof(m1000(ci)), offsets(j), 0, PAD), 'pad', PAD); %#ok<AGROW>
        end
    end
    % validation: m80 UDDS @ 10 C, +0.3 A, 60-sample pad
    ci = find_cycle(m80, 'UDDS', 10); X1 = Xof(m80(ci)); X1(:, 1) = X1(:, 1) + 0.3;
    vjob = struct('key', 'validation', 'X', [repmat(X1(1, :), 60, 1); X1], 'pad', 60);
end

function X = build_input(cycleX, offset, isocIdx, PAD)
    X1 = cycleX(isocIdx + 1:end, :);
    X1(:, 1) = X1(:, 1) + offset;
    pad = repmat(X1(1, :), PAD, 1);
    if isocIdx > 0, pad(:, 1) = 0; end
    X = [pad; X1];
end

function X = Xof(c)
    X = double([c.I(:), c.V(:), c.T(:)]);
end

function cyc = cell_of(data, name)
    names = arrayfun(@(e) char(string(e.name)), data.cells, 'UniformOutput', false);
    k = find(strcmp(names, name), 1);
    if isempty(k), error('SOCBENCH:DATA', 'blind data is missing cell %s', name); end
    cyc = data.cells(k).cycle;
end

function i = find_cycle(cyc, base, temp)
    for i = 1:numel(cyc)
        if logical(cyc(i).isTest) && startsWith(char(string(cyc(i).name)), base) && double(cyc(i).tempC) == temp, return; end
    end
    error('SOCBENCH:DATA', 'no %s at %g C', base, temp);
end

%% ===================================================================== execution
function runner = make_runner(runtime, mode, pkgDir, opts)
    if strcmp(runtime, 'matlab')
        addpath(pkgDir);
        runner = @(Xs) run_native(Xs);
        return;
    end
    switch mode
        case 'runner',   runner = @(Xs) run_python_once(Xs, pkgDir, opts.Python);
        case 'percycle', runner = @(Xs) run_python_percycle(Xs, pkgDir, opts.Python);
        case 'bridge',   runner = @(Xs) run_bridge(Xs, pkgDir);
        otherwise, error('SOCBENCH:CONFIG', 'unknown Mode %s', mode);
    end
end

function [preds, secs, err] = run_native(Xs)
    n = numel(Xs); preds = cell(n, 1); secs = zeros(n, 1); err = '';
    try
        for k = 1:n
            X = Xs{k}; y = zeros(size(X, 1), 1); t = tic;
            [y(1), z] = Model(X(1, :));
            for i = 2:size(X, 1), [y(i), z] = Model(X(i, :), z); end
            secs(k) = toc(t); preds{k} = y;
            fprintf('[native] %d/%d done in %.1f s (%d samples)\n', k, n, secs(k), size(X, 1));
        end
    catch ME
        err = ME.message;
    end
end

function [preds, secs, err] = run_python_once(Xs, pkgDir, py)
    td = tempname; mkdir(td); inp = fullfile(td, 'in.mat'); outp = fullfile(td, 'out.mat');
    X = Xs(:); save(inp, 'X', '-v7'); %#ok<NASGU>
    runnerPy = fullfile(fileparts(mfilename('fullpath')), 'socbench_runner.py');
    cmd = sprintf('"%s" "%s" "%s" "%s" "%s"', py, runnerPy, pkgDir, inp, outp);
    [status, msg] = system(cmd); %#ok<ASGLU>
    [preds, secs, err] = read_out(outp, numel(Xs), msg);
    try, rmdir(td, 's'); catch, end
end

function [preds, secs, err] = run_python_percycle(Xs, pkgDir, py)
    n = numel(Xs); preds = cell(n, 1); secs = zeros(n, 1); err = '';
    runnerPy = fullfile(fileparts(mfilename('fullpath')), 'socbench_runner.py');
    td = tempname; mkdir(td);
    for k = 1:n
        inp = fullfile(td, sprintf('in%d.mat', k)); outp = fullfile(td, sprintf('out%d.mat', k));
        X = Xs(k); save(inp, 'X', '-v7'); %#ok<NASGU>
        t = tic;                                                   % the original tool timed the whole round trip
        [~, msg] = system(sprintf('"%s" "%s" "%s" "%s" "%s"', py, runnerPy, pkgDir, inp, outp));
        secs(k) = toc(t);
        [p1, ~, err] = read_out(outp, 1, msg);
        if ~isempty(err), break; end
        preds{k} = p1{1};
        fprintf('[percycle] %d/%d done in %.1f s (%d samples)\n', k, n, secs(k), size(Xs{k}, 1));
    end
    try, rmdir(td, 's'); catch, end
end

function [preds, secs, err] = read_out(outp, n, msg)
    preds = {}; secs = []; err = '';
    if ~isfile(outp), err = sprintf('Python runner produced no output: %s', strtrim(msg)); return; end
    O = load(outp);
    if isfield(O, 'err') && ~isempty(strtrim(char(O.err))), err = strtrim(char(O.err)); return; end
    preds = O.preds(:); secs = double(O.secs(:));
    if numel(preds) ~= n, err = 'Python runner returned the wrong number of predictions.'; end
end

function [preds, secs, err] = run_bridge(Xs, pkgDir)
    n = numel(Xs); preds = cell(n, 1); secs = zeros(n, 1); err = '';
    try
        pe = pyenv;
        if pe.Version == "", error('SOCBENCH:CONFIG', 'MATLAB has no Python configured (pyenv).'); end
        sysp = py.sys.path; if ~any(cellfun(@(s) strcmp(char(s), pkgDir), cell(sysp))), insert(sysp, int32(0), pkgDir); end
        mod = py.importlib.import_module('Model'); mod = py.importlib.reload(mod);
        for k = 1:n
            X = Xs{k}; y = zeros(size(X, 1), 1); t = tic;
            res = mod.Model(py.numpy.array(X(1, :)));
            y(1) = double(res{1}); z = res{2};
            for i = 2:size(X, 1)
                res = mod.Model(py.numpy.array(X(i, :)), z);
                y(i) = double(res{1}); z = res{2};
            end
            secs(k) = toc(t); preds{k} = y;
            fprintf('[bridge] %d/%d done in %.1f s (%d samples)\n', k, n, secs(k), size(X, 1));
        end
    catch ME
        err = ME.message;
    end
end

%% ===================================================================== scoring
function [s, rows] = score(data, preds, P, meta)
    keys = {'m80', 'm448', 'm448N', 'm1000'}; labels = {'m80', 'm448', 'm448-N', 'm1000'};
    W = [0 1/10 1/10 1/10 1/30 2/30 2/30 1/30 1/10 1/10 1/60 1/60 1/60 1/60 1/60 1/60 1/10 1/10];
    names = {'allCells','blindedCell','nonBlindedCells','charging','massM80','massM448','massM448N','massM1000','standardCycles','nonStandardCycles','tempM20','tempM10','temp0','temp10','temp25','temp40','initialSocError','currentSensorOffset'};
    cols = cell(1, 4); charge = []; rows = {}; allMae = []; allMaxe = [];
    for c = 1:4
        cyc = cell_of(data, keys{c}); r = [];
        for i = 1:numel(cyc)
            p = preds(P(sprintf('cycle:%s:%d', keys{c}, i - 1))).soc; a = double(cyc(i).SOC(:));
            e = a - p;
            if logical(cyc(i).isCharge)
                charge(end + 1) = rmse(a, p); %#ok<AGROW>
            elseif logical(cyc(i).isTest)
                r(end + 1) = rmse(a, p); %#ok<AGROW>
                mae = 100 * mean(abs(e)); maxe = 100 * max(abs(e)); allMae(end + 1) = mae; allMaxe(end + 1) = maxe; %#ok<AGROW>
                rows{end + 1} = struct('cell', labels{c}, 'cycle', family(char(string(cyc(i).name))), 'temperatureC', double(cyc(i).tempC), ...
                    'rmse', round(r(end), 3), 'mae', round(mae, 3), 'maxErr', round(maxe, 3), 'durationH', round(numel(a) / 3600, 2)); %#ok<AGROW>
            end
        end
        cols{c} = r(:);
    end
    n = max(cellfun(@numel, cols)); R = zeros(n, 4);
    for c = 1:4, R(1:numel(cols{c}), c) = cols{c}; end
    means = mean(R, 1);
    res = zeros(1, 10);
    res(1) = mean(R(R ~= 0));
    res(2) = means(2);
    res(3) = mean([means(1), means(3), means(4)]);
    res(4) = mean(charge(charge ~= 0));
    res(5:8) = means;
    Sm = []; Cm = [];
    for i = 1:6:n
        Sm = [Sm; R(i:min(i + 3, n), :)]; %#ok<AGROW>
        if i + 4 <= n, Cm = [Cm; R(i + 4:min(i + 5, n), :)]; end %#ok<AGROW>
    end
    res(9)  = mean([mean(Sm(:, 1)), mean(Sm(Sm(:, 2) ~= 0, 2)), mean(Sm(:, 3)), mean(Sm(:, 4))]);
    res(10) = mean([mean(Cm(:, 1)), mean(Cm(Cm(:, 2) ~= 0, 2)), mean(Cm(:, 3)), mean(Cm(:, 4))]);
    m80 = R(:, 1); meanTemp = zeros(1, 6);
    for b = 1:6, meanTemp(b) = mean(m80((b - 1) * 6 + 1:b * 6)); end
    meanTemp([1 2]) = meanTemp([2 1]);
    m80c = cell_of(data, 'm80'); m1000c = cell_of(data, 'm1000');
    isoc = zeros(1, 9); isocW = [];
    for b = 1:3
        cyc = m80c(meta.isocCyc(b));
        for q = 1:3
            idx = meta.isocIdx(b, q); a = double(cyc.SOC(:)); a = a(idx + 1:end);
            isoc((b - 1) * 3 + q) = rmse(a, preds(P(sprintf('isoc:%d:%d:%d', b - 1, q - 1, idx))).soc);
            isocW = [isocW, repmat(isoc((b - 1) * 3 + q), 1, 3 - (q - 1))]; %#ok<AGROW>
        end
    end
    sens = zeros(1, 18);
    for b = 1:3
        cyc = m1000c(meta.offCyc(b)); a = double(cyc.SOC(:));
        for j = 1:6, sens((b - 1) * 6 + j) = rmse(a, preds(P(sprintf('offset:%d:%d', b - 1, j - 1))).soc); end
    end
    scores = [res, meanTemp, mean(isocW), mean(sens([1 6 7 12 13 18]))];
    s = struct();
    for i = 1:18, s.(names{i}) = round(scores(i), 3); end
    s.weightedError = round(sum(W .* scores), 3);
    s.suspicious = mean(R(:)) > 25;
    s.meanMae = round(mean(allMae), 3); s.meanMaxe = round(mean(allMaxe), 3); s.maxError = round(max(allMaxe), 3);
    s.robustness = struct('initialSocRmse', round(isoc, 3), 'currentOffsetRmse', round(sens, 3));
end

function v = rmse(a, p)
    v = 100 * sqrt(mean((a(:) - p(:)) .^ 2));
end

function f = family(name)
    fams = {'UDDS', 'HWFET', 'LA92', 'US06', 'HWCUST', 'HWGRADE', 'REORDERED', 'CC_CV_charge', 'Other'};
    for i = 1:numel(fams), if startsWith(name, fams{i}), f = fams{i}; return; end, end
    f = regexprep(name, '\d+$', '');
end

function [cat, tSample] = complexity(preds, runtime, cal)
    isCyc = startsWith({preds.key}, 'cycle:');
    tSample = mean([preds(isCyc).secs] ./ [preds(isCyc).n]);
    ratio = tSample / cal.(runtime); cat = 1; step = 10 ^ (1 / 3);
    while ratio > step, ratio = ratio / step; cat = cat + 1; end
    cat = max(1, min(10, cat));
end

%% ===================================================================== plumbing
function opts = parse(args)
    opts = struct('Mode', 'runner', 'Python', getenv('SOCBENCH_PYTHON'), ...
        'CalPython', str2double(getenv('SOCBENCH_CAL_PYTHON')), 'CalMatlab', str2double(getenv('SOCBENCH_CAL_MATLAB')));
    if isempty(opts.Python), opts.Python = 'python'; end
    if isnan(opts.CalPython), opts.CalPython = 9.2e-7; end
    if isnan(opts.CalMatlab), opts.CalMatlab = 3.5e-8; end
    for i = 1:2:numel(args), opts.(args{i}) = args{i + 1}; end
end

function fail(code, msg)
    error(['SOCBENCH:' code], '%s', msg);
end

function say(msg)
    fprintf('[%s] %s\n', datestr(now, 'HH:MM:SS'), msg);
end
