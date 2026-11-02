{{- /*
TeacherDox Helm Chart Helper Functions
*/ -}}

{{- define "teacherdox.name" -}}
{{- default .Chart.Name .Values.global.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "teacherdox.fullname" -}}
{{- if .Values.global.fullnameOverride }}
{{- .Values.global.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.global.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "teacherdox.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "teacherdox.labels" -}}
helm.sh/chart: {{ include "teacherdox.chart" . }}
{{ include "teacherdox.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "teacherdox.selectorLabels" -}}
app.kubernetes.io/name: {{ include "teacherdox.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "teacherdox.serviceAccountName" -}}
{{- if .Values.global.serviceAccount.create }}
{{- default (include "teacherdox.fullname" .) .Values.global.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.global.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "teacherdox.postgresql.fullname" -}}
{{- if .Values.postgresql.auth.existingSecret }}
{{- .Values.postgresql.auth.existingSecret }}
{{- else }}
{{- printf "%s-postgresql" (include "teacherdox.fullname" .) }}
{{- end }}
{{- end }}

{{- define "teacherdox.redis.fullname" -}}
{{- if .Values.redis.auth.existingSecret }}
{{- .Values.redis.auth.existingSecret }}
{{- else }}
{{- printf "%s-redis" (include "teacherdox.fullname" .) }}
{{- end }}
{{- end }}