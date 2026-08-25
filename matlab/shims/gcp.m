function p = gcp(varargin)
% GCP shim — used only when the Parallel Computing Toolbox is not installed.
% The lab's Obtain_Output_Data.m calls gcp('nocreate') to decide whether it can
% run each cycle under a parfeval watchdog; returning [] makes it fall back to
% the serial path (no per-cycle timeout — the worker's overall timeout applies).
% Install the Parallel Computing Toolbox to get the original watchdog behaviour.
    p = [];
end
