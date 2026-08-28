# Sandbox image for evaluating *MATLAB* submissions (Model.m / Model.p).
#
# Base: MathWorks' official "matlab-deep-learning" image (Ubuntu + MATLAB + Deep Learning, Signal Processing,
# Statistics & ML, Parallel Computing, Image Processing, Computer Vision, Text Analytics, MATLAB/GPU Coder).
# That already covers every toolbox submissions have needed, so nothing is downloaded with mpm. Linux x86-64 only.
#
#   # build context is the REPO ROOT (the harness lives in evaluator/python, the MATLAB shim in matlab/)
#   sudo docker build -t socbench-eval-matlab -f evaluator/Dockerfile.matlab \
#     --build-arg MATLAB_UID=$(id -u socbench) --build-arg MATLAB_GID=$(id -g socbench) .
#
# MATLAB_UID/GID: the image's `matlab` user is remapped to the worker's service account so that (a) the worker can run
# the container with `--user <socbench>` like the Python sandbox, (b) the blinded data can stay mode 600, and (c) the
# licence token written to /home/matlab by the one-time login below is owned by the same uid.
#
# Licensing — campus-wide licence via MathWorks *online licensing* (docs/drac-migration.md → "MATLAB on the VM").
#   No token is baked into this image. The licence holder signs in once through the browser UI on the evaluation
#   host (scripts/matlab-mhlm-setup.sh); that leaves a one-year identity token in /etc/socbench/matlab-mhlm.json
#   (mode 600). Before each MATLAB evaluation the worker exchanges it for a 24 h access token and passes only that
#   into the container (MLM_WEB_LICENSE / MLM_WEB_USER_CRED / MLM_WEB_ID). The exchange needs egress to
#   login.mathworks.com, so MATLAB containers run with EVAL_MATLAB_NETWORK (Python ones keep --network none).
#   Alternative (network licence manager): EVAL_MATLAB_LICENSE="27000@server" → MLM_LICENSE_FILE.
ARG BASE=mathworks/matlab-deep-learning:r2026a
FROM ${BASE}

ARG MATLAB_UID=1000
ARG MATLAB_GID=1000
USER root
# Python for the benchmark harness (the evaluator is Python; it drives MATLAB with `matlab -batch`). Skipped on rebuilds.
RUN if ! python3 -c "import numpy, scipy" 2>/dev/null; then \
      apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/* \
      && pip3 install --no-cache-dir --break-system-packages "numpy>=1.26" "scipy>=1.11"; fi
# Remap the image's user to the worker's service account (see above). No-op when already matching.
RUN ["/bin/bash", "-c", "if [ \"$(id -u matlab)\" != \"${MATLAB_UID}\" ] || [ \"$(id -g matlab)\" != \"${MATLAB_GID}\" ]; then groupmod -o -g ${MATLAB_GID} matlab && usermod -o -u ${MATLAB_UID} -g ${MATLAB_GID} matlab && chown -R matlab:matlab /home/matlab; fi"]

RUN mkdir -p /work /out /in /data /app && chown matlab /work /out
COPY evaluator/python/socbench_eval /app/socbench_eval
COPY evaluator/python/dryrun_data.mat /app/dryrun_data.mat
COPY matlab/Run_Model.m /app/matlab/Run_Model.m
RUN chown -R matlab:matlab /app
ENV PYTHONPATH=/app TMPDIR=/work PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 \
    MATLAB_BIN=matlab SOCBENCH_MATLAB_SCRIPTS=/app/matlab HOME=/home/matlab
WORKDIR /work
USER matlab
ENTRYPOINT ["python3", "-m", "socbench_eval"]
