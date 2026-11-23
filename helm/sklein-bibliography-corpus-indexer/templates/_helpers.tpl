{{- define "sklein-bibliography-corpus-indexer.labels" -}}
app.kubernetes.io/name: sklein-bibliography-corpus-indexer
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

