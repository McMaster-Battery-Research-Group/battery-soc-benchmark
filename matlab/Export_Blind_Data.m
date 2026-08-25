function Export_Blind_Data(toolDir, outFile)
% EXPORT_BLIND_DATA  One-time export of the blinded dataset to plain arrays.
%
%   Export_Blind_Data('<Standardized Evaluation Tool>', 'blind_data.mat')
%
% The lab's Data_m*.mat files store MATLAB tables, which Python cannot read.
% This writes a numeric-only, version-7 .mat that scipy.io.loadmat understands,
% preserving the exact cycle order the MATLAB tool relies on for grouping.
%
%   blind.cells(k).name        'm80' | 'm448' | 'm448N' | 'm1000'
%   blind.cells(k).cycle(i)    struct: name, tempC, isTest (0 for Other/CC_CV_charge),
%                              isCharge, I, V, T, SOC  (column vectors, 1 Hz)
%
% KEEP THE OUTPUT WITH THE BLINDED DATA — it is the answer key.

    if nargin < 2, outFile = fullfile(toolDir, 'blind_data.mat'); end
    names = {'m80','m448','m448N','m1000'};
    blind = struct('cells', struct('name', {}, 'cycle', {}));
    for k = 1:numel(names)
        S = load(fullfile(toolDir, ['Data_' names{k} '.mat']));
        D = S.(['Data_' names{k}]);
        T = D.cycle;                                  % table: Cycle, Temperature, Time?, Data
        n = height(T);
        cyc = struct('name', {}, 'tempC', {}, 'isTest', {}, 'isCharge', {}, 'I', {}, 'V', {}, 'T', {}, 'SOC', {});
        for i = 1:n
            nm = char(string(T{i,1}));
            tp = T{i,2}; if iscell(tp), tp = tp{1}; end
            d  = T.Data{i,1};
            cyc(i).name     = nm;
            cyc(i).tempC    = double(tp);
            cyc(i).isCharge = strcmp(nm, 'CC_CV_charge');
            cyc(i).isTest   = ~(strcmp(nm, 'Other') || cyc(i).isCharge);
            cyc(i).I   = double(d.Current(:));
            cyc(i).V   = double(d.Voltage(:));
            cyc(i).T   = double(d.Battery_Temp_degC(:));
            cyc(i).SOC = double(d.SOC(:));
        end
        blind.cells(k).name  = names{k};
        blind.cells(k).cycle = cyc;
        fprintf('%s: %d cycles (%d test, %d charge)\n', names{k}, n, sum([cyc.isTest]), sum([cyc.isCharge]));
    end
    save(outFile, 'blind', '-v7');
    fprintf('wrote %s\n', outFile);
end
