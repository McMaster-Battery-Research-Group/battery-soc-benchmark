# Sandbox image for evaluating *MATLAB* submissions (Model.m / Model.p).
#
# Built on MathWorks' official image (Ubuntu + MATLAB, Linux x86-64 only):
#   docker build -t socbench-eval-matlab -f evaluator/Dockerfile.matlab \
#     --build-arg MATLAB_RELEASE=r2025b \
#     --build-arg PRODUCTS="MATLAB Signal_Processing_Toolbox Deep_Learning_Toolbox Statistics_and_Machine_Learning_Toolbox Control_System_Toolbox System_Identification_Toolbox Optimization_Toolbox Curve_Fitting_Toolbox" \
#     evaluator
#
# Licensing at run time (set on the worker host):
#   EVAL_MATLAB_LICENSE = "27000@license.mcmaster.ca"  (network license / TAH server)  -> passed as MLM_LICENSE_FILE
#   EVAL_MATLAB_NETWORK = "bridge"  only if the license server must be reachable;
#   otherwise the container runs with --network none like the Python one.
# See https://github.com/mathworks-ref-arch/matlab-dockerfile for the base image options.
ARG MATLAB_RELEASE=r2025b
FROM mathworks/matlab:${MATLAB_RELEASE}

ARG PRODUCTS="MATLAB Signal_Processing_Toolbox Deep_Learning_Toolbox"
USER root
# Add the toolboxes the base image lacks, plus Python for the benchmark itself.
RUN wget -q https://www.mathworks.com/mpm/glnxa64/mpm -O /tmp/mpm && chmod +x /tmp/mpm \
 && /tmp/mpm install --release=${MATLAB_RELEASE} --destination=/opt/matlab/${MATLAB_RELEASE} --products ${PRODUCTS} \
 && rm -f /tmp/mpm \
 && apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages "numpy>=1.26" "scipy>=1.11"

RUN mkdir -p /work /out /in /data /app && chown matlab /work /out
COPY python/socbench_eval /app/socbench_eval
COPY python/dryrun_data.mat /app/dryrun_data.mat
COPY matlab/Run_Model.m /app/matlab/Run_Model.m
ENV PYTHONPATH=/app TMPDIR=/work PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 \
    MATLAB_BIN=/opt/matlab/${MATLAB_RELEASE}/bin/matlab SOCBENCH_MATLAB_SCRIPTS=/app/matlab
WORKDIR /work
USER matlab
ENTRYPOINT ["python3", "-m", "socbench_eval"]
