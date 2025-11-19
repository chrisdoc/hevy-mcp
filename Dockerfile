# hevy-mcp Docker support was retired in favor of local stdio usage via npx.
# This file intentionally fails to build to make the deprecation explicit.
# Previously published images remain available on GHCR for historical purposes.

FROM alpine:3.20 AS deprecated
RUN echo "hevy-mcp Docker images are no longer maintained.\n" \
	&& echo "Install locally instead: npx hevy-mcp" \
	&& exit 1
