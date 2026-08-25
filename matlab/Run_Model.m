function Run_Model(pkgDir, inFile, outFile)
% RUN_MODEL  Execute a submitted MATLAB estimator (Model.m / Model.p) on a batch
% of input matrices. This is the ONLY thing MATLAB does in the benchmark; all
% padding, offsets, metrics and scoring live in evaluator/python/socbench_eval.
%
%   inFile : .mat with cell array X{k} = N_k x 3 [Current, Voltage, Temperature]
%   outFile: .mat with preds{k} (N_k x 1 SOC), secs(k) wall time per matrix,
%            err ('' on success, otherwise the model's error message)
%
% Called by the Python evaluator as:
%   matlab -batch "addpath('<repo>/matlab'); Run_Model('<pkg dir>','<in.mat>','<out.mat>')"
    err = '';
    preds = {};
    secs = [];
    try
        addpath(pkgDir);
        if ~(isfile(fullfile(pkgDir, 'Model.m')) || isfile(fullfile(pkgDir, 'Model.p')))
            error('SOCBENCH:FORMAT', 'No Model.m or Model.p in the package.');
        end
        S = load(inFile);
        n = numel(S.X);
        preds = cell(n, 1);
        secs = zeros(n, 1);
        for k = 1:n
            X = double(S.X{k});
            y = zeros(size(X, 1), 1);
            t = tic;
            [y(1), z] = Model(X(1, :));
            for i = 2:size(X, 1)
                [y(i), z] = Model(X(i, :), z);
            end
            secs(k) = toc(t);
            preds{k} = y;
            fprintf('[Run_Model] %d/%d done in %.1f s (%d samples)\n', k, n, secs(k), size(X, 1));
        end
    catch ME
        err = sprintf('%s', ME.message);
        if ~isempty(ME.stack)
            err = sprintf('%s (in %s line %d)', err, ME.stack(1).name, ME.stack(1).line);
        end
        fprintf(2, '[Run_Model] ERROR: %s\n', err);
    end
    save(outFile, 'preds', 'secs', 'err', '-v7');
    if ~isempty(err), exit(1); end
end
