{{- define "quasar-tracing.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "quasar-tracing.namespace" -}}
{{- default .Release.Namespace .Values.namespaceOverride -}}
{{- end -}}

{{- define "quasar-tracing.labels" -}}
app.kubernetes.io/name: {{ include "quasar-tracing.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "quasar-tracing.componentLabels" -}}
{{ include "quasar-tracing.labels" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "quasar-tracing.instrumentationResourceAttributes" -}}
{{- $attrs := list -}}
{{- with .Values.instrumentation.resourceAttributes.serviceNamespace -}}
{{- $attrs = append $attrs (printf "service.namespace=%s" .) -}}
{{- end -}}
{{- with .Values.instrumentation.resourceAttributes.environmentName -}}
{{- $attrs = append $attrs (printf "deployment.environment.name=%s" .) -}}
{{- end -}}
{{- with .Values.instrumentation.resourceAttributes.serviceVersion -}}
{{- $attrs = append $attrs (printf "service.version=%s" .) -}}
{{- end -}}
{{- $extra := .Values.instrumentation.resourceAttributes.extra | default dict -}}
{{- range $key := keys $extra | sortAlpha -}}
{{- $value := index $extra $key -}}
{{- if $value -}}
{{- $attrs = append $attrs (printf "%s=%s" $key $value) -}}
{{- end -}}
{{- end -}}
{{- join "," $attrs -}}
{{- end -}}
