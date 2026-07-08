# Metrics Demo 页面优化设计

## 目标

基于 Grafana + Prometheus 常见 metrics 展示范式，继续完善 `MetricsDemoPage` 原型页。页面重点不是做一个“概念化大屏”，而是让用户按真实排障路径快速判断：服务是否异常、异常发生在哪些端点、是否集中在某些实例、运行时资源是否相关，以及是否还能下钻到 Trace / Logs。

当前页面仍作为 mock 数据演示页保留在 `/metrics-demo`，不替换真实 `/metrics` 页面，不请求后端接口。

## 信息层级

页面模块顺序按故障排查优先级排列：

1. **服务概览**：放在最前面，展示 RPS、错误率、p99 延迟、活跃实例数。用户进入页面第一眼能判断当前服务是否异常。
2. **RED 指标趋势**：展示 Rate、Errors、Duration 的时间序列，用于确认异常窗口和趋势变化。
3. **端点指标**：按错误率和 p99 延迟优先排序，帮助用户定位哪个接口最可能造成问题，并保留 Trace / Logs 下钻入口。
4. **实例明细**：把实例维度和展开信息合并到一个模块。表格行展示实例运行状态、RPS、错误率、p99、CPU / Memory；展开行展示标准资源属性，例如 `service.instance.id`、`host.name`、`container.id`、`container.image.name`、`k8s.namespace.name`、`k8s.pod.name`、`k8s.node.name`。避免把相同的 RPS、状态、错误率等信息重复展示两遍。
5. **延迟分布 / JVM 指标**：作为辅助判断模块，用于分析长尾延迟和运行时资源瓶颈。
6. **原始指标浏览**：作为未来接入 `metric_series_index` 后的 metrics explorer 预览，只展示标准指标名、类型、series 数量和最后上报时间。

## 命名原则

页面标题和模块标题使用标准、可理解的可观测性术语，不再使用自造词或过度产品化表达。

保留命名：

- 页面标题：`服务指标看板`
- 核心趋势：`RED 指标趋势`
- 接口维度：`端点指标`
- 实例维度：`实例明细`
- 延迟视角：`延迟分布`
- 运行时视角：`JVM 指标`
- 原始指标视角：`原始指标浏览`

避免命名：

- `实例归因`
- `拖后腿`
- `服务哪里不对`
- `健康诊断`
- `哪些接口最可疑`
- `慢请求集中在哪`

这些词要么不标准，要么含义过重，容易让用户不知道实际对应哪类指标。

## 视觉方向

视觉风格沿着“专业监控工作台 + 高级科技感”做，而不是做纯装饰大屏。

设计原则：

- 保留真实监控产品的信息密度，核心数据优先。
- 使用深色 hero / 核心指标区增强科技感，但表格和明细仍保持清晰可读。
- 使用发光线条、渐变边框、细网格背景表达 telemetry / signal 的感觉。
- 动效集中在页面入场、指标卡片 hover、图表加载、实例展开，不做分散的炫技动画。
- 支持 `prefers-reduced-motion`，减少动效时仍可正常阅读。

## 动效设计

计划加入的动效：

1. **页面入场**：核心区域轻微上浮 + 透明度过渡，形成 dashboard 初始化感。
2. **指标卡片**：hover 时轻微抬升、边框高亮、背景微光移动，不影响阅读。
3. **RED 图表**：继续使用 ECharts 平滑入场，增强线条 glow 和渐变 area。
4. **实例展开**：展开区域使用轻微 fade / slide，资源属性以标准 key-value 网格展示。
5. **异常状态**：错误率、p99、故障实例使用克制的红橙状态色，不用夸张闪烁，避免误导为实时告警。

## 实例明细设计

实例模块需要覆盖多种部署形态：

- Kubernetes Pod：展示 `k8s.namespace.name`、`k8s.pod.name`、`k8s.node.name`、`container.id`、`container.image.name`。
- Docker / Compose：展示 `container.id`、`container.image.name`、`host.name`，K8s 字段为空时不强行突出。
- Bare Java：展示 `service.instance.id`、`host.name`、process/host 来源信息，不把不存在的 container / k8s 信息伪装成有效维度。

表格主行只展示排障必须的一层信息，展开行只展示资源属性和采集来源，去掉冗余信息。

## 实现范围

本次只修改演示页相关文件：

- `control-panel/src/pages/Metrics/MetricsDemoPage.jsx`
- 如需局部样式，可优先使用该页面内的 className 和现有 `global.css` 里的基础变量；非必要不改全局主题。

不修改真实 `/metrics` API、不改后端、不改 ClickHouse / Prometheus / OTel 采集逻辑。

## 验证

完成实现后至少验证：

- `/metrics-demo` 能正常渲染。
- 前端构建通过：`npm run build --prefix control-panel`。
- 页面中不再出现已否定的自造标题词。
- 实例展开能看到 Pod、Docker / Compose、Bare Java 三类 mock 数据差异。
