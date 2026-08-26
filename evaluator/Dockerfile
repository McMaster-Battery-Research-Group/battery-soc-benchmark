# Sandbox image for evaluating *Python* submissions (Model.py).
#
#   docker build -t socbench-eval evaluator
#   # optional: with PyTorch for submissions that need it (+~800 MB)
#   docker build -t socbench-eval --build-arg TORCH=1 evaluator
#
# The worker runs one container per evaluation with no network, a read-only
# root filesystem, dropped capabilities, CPU/memory/pid limits and only three
# mounts: the package (ro), the blinded data (ro) and an output directory.
# Nothing else from the host — no .env, no secrets — is visible inside.
FROM python:3.12-slim

ARG TORCH=0
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 PYTHONIOENCODING=utf-8

RUN pip install --no-cache-dir "numpy>=1.26" "scipy>=1.11" \
 && if [ "$TORCH" = "1" ]; then pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch; fi

# unprivileged user; /work is the only writable place besides the mounted /out
RUN useradd -u 1000 -m -s /usr/sbin/nologin evaluator && mkdir -p /work /out /in /data && chown evaluator /work /out
COPY python/socbench_eval /app/socbench_eval
COPY python/dryrun_data.mat /app/dryrun_data.mat
ENV PYTHONPATH=/app TMPDIR=/work GPG_KEY=
WORKDIR /work
USER evaluator
ENTRYPOINT ["python", "-m", "socbench_eval"]
