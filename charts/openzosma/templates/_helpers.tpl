{{/*
Expand the name of the chart.
*/}}
{{- define "openzosma.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "openzosma.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "openzosma.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "openzosma.labels" -}}
helm.sh/chart: {{ include "openzosma.chart" . }}
{{ include "openzosma.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "openzosma.selectorLabels" -}}
app.kubernetes.io/name: {{ include "openzosma.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Gateway selector labels.
*/}}
{{- define "openzosma.gateway.selectorLabels" -}}
{{ include "openzosma.selectorLabels" . }}
app.kubernetes.io/component: gateway
{{- end }}

{{/*
Web selector labels.
*/}}
{{- define "openzosma.web.selectorLabels" -}}
{{ include "openzosma.selectorLabels" . }}
app.kubernetes.io/component: web
{{- end }}

{{/*
Service account name.
*/}}
{{- define "openzosma.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "openzosma.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Construct the DATABASE_URL from postgresql values.
*/}}
{{- define "openzosma.databaseUrl" -}}
postgresql://{{ .Values.postgresql.username }}:$(DB_PASS)@{{ .Values.postgresql.host }}:{{ .Values.postgresql.port }}/{{ .Values.postgresql.database }}
{{- end }}

{{/*
Name of the secret containing sensitive values.
*/}}
{{- define "openzosma.secretName" -}}
{{ include "openzosma.fullname" . }}
{{- end }}

{{/*
Name of the configmap.
*/}}
{{- define "openzosma.configmapName" -}}
{{ include "openzosma.fullname" . }}
{{- end }}
