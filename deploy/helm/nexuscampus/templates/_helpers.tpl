{{/*
Shared naming, labels, images, and env helpers for the NexusCampus Helm chart (NEX-120).
*/}}

{{- define "nexuscampus.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "nexuscampus.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "nexuscampus.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
app.kubernetes.io/part-of: nexuscampus
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{- define "nexuscampus.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nexuscampus.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "nexuscampus.image" -}}
{{- if .digest -}}
{{- printf "%s:%s@%s" .repository .tag .digest -}}
{{- else -}}
{{- printf "%s:%s" .repository .tag -}}
{{- end -}}
{{- end -}}

{{- define "nexuscampus.dbHost" -}}
{{- if .Values.db.enabled -}}
{{- printf "%s-db" (include "nexuscampus.fullname" .) -}}
{{- else -}}
{{- required "db.external.host is required when db.enabled=false" .Values.db.external.host -}}
{{- end -}}
{{- end -}}

{{- define "nexuscampus.dbPort" -}}
{{- if .Values.db.enabled -}}5432{{- else -}}{{ .Values.db.external.port | default 5432 }}{{- end -}}
{{- end -}}

{{- define "nexuscampus.valkeyUrl" -}}
{{- if .Values.valkey.enabled -}}
{{- printf "redis://%s-valkey:6379/0" (include "nexuscampus.fullname" .) -}}
{{- else -}}
{{- printf "redis://%s:%v/%v" (required "valkey.external.host is required when valkey.enabled=false" .Values.valkey.external.host) (.Values.valkey.external.port | default 6379) (.Values.valkey.external.db | default 0) -}}
{{- end -}}
{{- end -}}

{{- define "nexuscampus.openbaoUrl" -}}
{{- if .Values.openbao.enabled -}}
{{- printf "http://%s-openbao:8200" (include "nexuscampus.fullname" .) -}}
{{- else -}}
{{- required "openbao.external.url is required when openbao.enabled=false" .Values.openbao.external.url -}}
{{- end -}}
{{- end -}}

{{- define "nexuscampus.keycloakUrl" -}}
{{- if .Values.keycloak.enabled -}}
{{- printf "http://%s-keycloak:8080" (include "nexuscampus.fullname" .) -}}
{{- else -}}
{{- required "keycloak.external.url is required when keycloak.enabled=false" .Values.keycloak.external.url -}}
{{- end -}}
{{- end -}}

{{- define "nexuscampus.appEnv" -}}
- name: NEXUS_ENVIRONMENT
  value: "prod"
- name: NEXUS_REGION
  value: {{ .Values.region | quote }}
- name: NEXUS_DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.secrets.appExistingSecret | quote }}
      key: NEXUS_DB_PASSWORD
- name: NEXUS_APP_DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.secrets.appExistingSecret | quote }}
      key: NEXUS_APP_DB_PASSWORD
- name: NEXUS_DATABASE_URL
  value: {{ printf "postgresql+psycopg://%s:$(NEXUS_APP_DB_PASSWORD)@%s:%s/%s" .Values.db.appUser (include "nexuscampus.dbHost" .) (include "nexuscampus.dbPort" .) .Values.db.database | quote }}
- name: NEXUS_MIGRATE_DATABASE_URL
  value: {{ printf "postgresql+psycopg://%s:$(NEXUS_DB_PASSWORD)@%s:%s/%s" .Values.db.ownerUser (include "nexuscampus.dbHost" .) (include "nexuscampus.dbPort" .) .Values.db.database | quote }}
- name: NEXUS_REDIS_URL
  value: {{ include "nexuscampus.valkeyUrl" . | quote }}
- name: NEXUS_KEYCLOAK_URL
  value: {{ include "nexuscampus.keycloakUrl" . | quote }}
- name: NEXUS_KEYCLOAK_REALM
  value: {{ .Values.keycloak.realm | quote }}
- name: NEXUS_OIDC_CLIENT_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ .Values.secrets.appExistingSecret | quote }}
      key: NEXUS_OIDC_CLIENT_SECRET
- name: NEXUS_API_PUBLIC_URL
  value: {{ .Values.publicUrl | quote }}
- name: NEXUS_APP_PUBLIC_URL
  value: {{ .Values.publicUrl | quote }}
- name: NEXUS_VAULT_URL
  value: {{ include "nexuscampus.openbaoUrl" . | quote }}
- name: NEXUS_VAULT_TOKEN
  valueFrom:
    secretKeyRef:
      name: {{ .Values.secrets.appExistingSecret | quote }}
      key: NEXUS_VAULT_TOKEN
      optional: true
- name: NEXUS_GRANT_SIGNING_KEY
  valueFrom:
    secretKeyRef:
      name: {{ .Values.secrets.appExistingSecret | quote }}
      key: NEXUS_GRANT_SIGNING_KEY
- name: NEXUS_AI_PROVIDER
  value: {{ .Values.ai.provider | quote }}
- name: NEXUS_ANTHROPIC_API_KEY
  valueFrom:
    secretKeyRef:
      name: {{ .Values.secrets.appExistingSecret | quote }}
      key: NEXUS_ANTHROPIC_API_KEY
      optional: true
- name: NEXUS_AIR_GAPPED
  value: {{ ternary "true" "false" .Values.control.airGapped | quote }}
- name: NEXUS_TELEMETRY_ENABLED
  value: {{ ternary "true" "false" .Values.control.telemetryEnabled | quote }}
{{- if and .Values.control.url (not .Values.control.airGapped) }}
- name: NEXUS_CONTROL_URL
  value: {{ .Values.control.url | quote }}
- name: NEXUS_CONTROL_AGENT_TOKEN
  valueFrom:
    secretKeyRef:
      name: {{ .Values.secrets.appExistingSecret | quote }}
      key: NEXUS_CONTROL_AGENT_TOKEN
      optional: true
{{- end }}
{{- end -}}
