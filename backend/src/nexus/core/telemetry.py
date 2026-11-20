"""OpenTelemetry traces for every request. Exporter `none` (default) or `console` in dev; OTLP to the region
cell's collector comes with deployment (NEX-064). Spans carry no personal data (route templates, not URLs).
"""

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

from nexus.settings import Settings


def setup_telemetry(app: FastAPI, settings: Settings) -> None:
    if settings.otel_exporter == "none":
        return
    provider = TracerProvider(
        resource=Resource.create({"service.name": "nexus-backend", "deployment.environment": settings.environment})
    )
    provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider, excluded_urls="healthz,readyz")
