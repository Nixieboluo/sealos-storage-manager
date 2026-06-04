GO ?= go
GOLANGCI_LINT ?= golangci-lint
GOVULNCHECK ?= govulncheck
ENCORE ?= encore
CONFIG ?= config/viewer.debug.yaml
INTEGRATION_CONFIG ?= config/viewer.integration.yaml
IMAGE ?= sealos-storage-manager-viewer:dev

.PHONY: dev fmt fmt-check lint vet test test-race test-integration security build-image verify tidy

dev:
	CONFIG=$(CONFIG) $(ENCORE) run --listen 0.0.0.0:4000 --browser=never

fmt:
	$(GO) fmt ./...

fmt-check:
	@test -z "$$($(GO) fmt ./...)" || (echo "gofmt changed files; run make fmt" && exit 1)

lint:
	$(GOLANGCI_LINT) run ./...

vet:
	$(GO) vet ./...

test:
	$(ENCORE) test ./...

test-race:
	$(ENCORE) test -race ./...

test-integration:
	CONFIG=$(INTEGRATION_CONFIG) $(ENCORE) test -tags=integration ./test/integration -count=1

security:
	$(GOVULNCHECK) ./...

build-image:
	$(ENCORE) build docker --config=infra-config.json $(IMAGE)

tidy:
	$(GO) mod tidy

verify: fmt-check vet test
