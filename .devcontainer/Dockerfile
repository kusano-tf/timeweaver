FROM mcr.microsoft.com/devcontainers/base:noble

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/home/vscode/.local/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# # gcloud のインストール
# RUN curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
#     | gpg --dearmor -o /usr/share/keyrings/google-cloud.gpg \
#     && echo "deb [signed-by=/usr/share/keyrings/google-cloud.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
#     > /etc/apt/sources.list.d/google-cloud-sdk.list \
#     && apt-get update \
#     && apt-get install -y --no-install-recommends google-cloud-sdk \
#     && rm -rf /var/lib/apt/lists/*

