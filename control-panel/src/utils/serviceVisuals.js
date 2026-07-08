/**
 * Technology and infrastructure visuals for service topology nodes.
 *
 * @author Quasar
 */

const COLOR = {
  go: '#00ADD8',
  spring: '#6DB33F',
  java: '#E76F00',
  redis: '#D82C20',
  kafka: '#1F2937',
  clickhouse: '#FFD21E',
  mysql: '#2E7DD1',
  mongo: '#10A64A',
  elastic: '#F5C542',
  nginx: '#009639',
  mq: '#14B8A6',
  datastore: '#2E7DD1',
  external: '#8B5CF6',
  service: '#F26A1B',
};

const escapeSvg = (svg) => `image://data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

function shell({ bg, border, alert, selected, body }) {
  const stroke = alert ? '#E5484D' : selected ? '#F26A1B' : border;
  const strokeWidth = alert || selected ? 4 : 2;
  return escapeSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect x="3" y="3" width="58" height="58" rx="16" fill="${bg}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
      ${body}
    </svg>
  `);
}

const icons = {
  gopher: (state) => shell({
    ...state,
    bg: '#E7FAFF',
    border: COLOR.go,
    body: `
      <circle cx="20" cy="22" r="7" fill="#7DDDF2" stroke="#169DBA" stroke-width="2"/>
      <circle cx="44" cy="22" r="7" fill="#7DDDF2" stroke="#169DBA" stroke-width="2"/>
      <ellipse cx="32" cy="35" rx="18" ry="17" fill="#7DDDF2" stroke="#169DBA" stroke-width="2"/>
      <circle cx="25" cy="32" r="3" fill="#111827"/>
      <circle cx="39" cy="32" r="3" fill="#111827"/>
      <ellipse cx="32" cy="38" rx="4" ry="3" fill="#F59E0B"/>
      <rect x="27" y="43" width="10" height="7" rx="2" fill="#FFFFFF" stroke="#169DBA" stroke-width="1.4"/>
      <path d="M32 43v7" stroke="#169DBA" stroke-width="1.3"/>
    `,
  }),
  spring: (state) => shell({
    ...state,
    bg: '#EFFBEA',
    border: COLOR.spring,
    body: `
      <path d="M47 15C29 16 17 27 18 43c15 2 27-7 29-28Z" fill="#6DB33F"/>
      <path d="M20 43c8-13 17-19 27-26" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
      <path d="M28 34c4 0 7-1 10-4" fill="none" stroke="#DFF7D7" stroke-width="2" stroke-linecap="round"/>
    `,
  }),
  java: (state) => shell({
    ...state,
    bg: '#FFF4E8',
    border: COLOR.java,
    body: `
      <path d="M28 13c5 5-4 7 1 12M38 12c5 6-5 8 0 13" fill="none" stroke="#E76F00" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M18 30h26v8c0 8-5 13-13 13s-13-5-13-13v-8Z" fill="#FFFFFF" stroke="#E76F00" stroke-width="3"/>
      <path d="M44 32h4c4 0 5 8-2 10h-2" fill="none" stroke="#E76F00" stroke-width="3" stroke-linecap="round"/>
      <path d="M16 53h32" stroke="#E76F00" stroke-width="3" stroke-linecap="round"/>
    `,
  }),
  redis: (state) => shell({
    ...state,
    bg: '#FFF0EE',
    border: COLOR.redis,
    body: `
      <path d="M16 39 32 31l16 8-16 8-16-8Z" fill="#C81E1E"/>
      <path d="M16 31 32 23l16 8-16 8-16-8Z" fill="#EF4444"/>
      <path d="M16 23 32 15l16 8-16 8-16-8Z" fill="#F87171"/>
      <path d="M24 23h16M27 31h10M24 39h16" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    `,
  }),
  kafka: (state) => shell({
    ...state,
    bg: '#F3F4F6',
    border: COLOR.kafka,
    body: `
      <circle cx="22" cy="21" r="6" fill="#111827"/>
      <circle cx="42" cy="32" r="6" fill="#111827"/>
      <circle cx="22" cy="43" r="6" fill="#111827"/>
      <path d="M27 23 37 30M27 41l10-7" stroke="#111827" stroke-width="4" stroke-linecap="round"/>
      <circle cx="22" cy="21" r="2" fill="#FFFFFF"/>
      <circle cx="42" cy="32" r="2" fill="#FFFFFF"/>
      <circle cx="22" cy="43" r="2" fill="#FFFFFF"/>
    `,
  }),
  clickhouse: (state) => shell({
    ...state,
    bg: '#111827',
    border: COLOR.clickhouse,
    body: `
      <rect x="17" y="14" width="6" height="36" fill="#FFD21E"/>
      <rect x="26" y="14" width="6" height="36" fill="#FFD21E"/>
      <rect x="35" y="14" width="6" height="36" fill="#FFD21E"/>
      <rect x="44" y="14" width="4" height="22" fill="#FFD21E"/>
      <rect x="44" y="39" width="4" height="11" fill="#EF4444"/>
    `,
  }),
  database: (state) => shell({
    ...state,
    bg: '#EFF6FF',
    border: COLOR.datastore,
    body: `
      <ellipse cx="32" cy="19" rx="16" ry="7" fill="#BFDBFE" stroke="#2E7DD1" stroke-width="2.5"/>
      <path d="M16 19v24c0 4 7 7 16 7s16-3 16-7V19" fill="#DBEAFE" stroke="#2E7DD1" stroke-width="2.5"/>
      <path d="M16 31c0 4 7 7 16 7s16-3 16-7" fill="none" stroke="#2E7DD1" stroke-width="2"/>
    `,
  }),
  mongo: (state) => shell({
    ...state,
    bg: '#ECFDF3',
    border: COLOR.mongo,
    body: `
      <path d="M33 12c11 10 13 22 1 40-12-17-10-31-1-40Z" fill="#10A64A"/>
      <path d="M33 18c-1 10-1 21 1 32" stroke="#D1FAE5" stroke-width="2.5" stroke-linecap="round"/>
    `,
  }),
  elastic: (state) => shell({
    ...state,
    bg: '#FFF8DB',
    border: COLOR.elastic,
    body: `
      <path d="M19 25a15 15 0 0 1 27-7L35 30H18c0-2 .3-3.5 1-5Z" fill="#F5C542"/>
      <path d="M18 34h18l10 12A15 15 0 0 1 18 34Z" fill="#00BFB3"/>
      <path d="M38 31 49 19a15 15 0 0 1 0 26L38 33Z" fill="#343741"/>
    `,
  }),
  nginx: (state) => shell({
    ...state,
    bg: '#ECFDF3',
    border: COLOR.nginx,
    body: `
      <path d="M32 12 49 22v20L32 52 15 42V22l17-10Z" fill="#009639"/>
      <path d="M24 40V24h5l7 9v-9h5v16h-5l-7-9v9h-5Z" fill="#FFFFFF"/>
    `,
  }),
  mq: (state) => shell({
    ...state,
    bg: '#ECFEFF',
    border: COLOR.mq,
    body: `
      <rect x="16" y="19" width="32" height="9" rx="4.5" fill="#14B8A6"/>
      <rect x="16" y="36" width="32" height="9" rx="4.5" fill="#0E7490"/>
      <path d="M25 28v8M39 28v8" stroke="#083344" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M21 23h9M21 40h9" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
    `,
  }),
  external: (state) => shell({
    ...state,
    bg: '#F5F3FF',
    border: COLOR.external,
    body: `
      <path d="M21 41h25a8 8 0 0 0 1-16 13 13 0 0 0-24-4 10 10 0 0 0-2 20Z" fill="#DDD6FE" stroke="#8B5CF6" stroke-width="2.5"/>
      <path d="M27 34h14" stroke="#8B5CF6" stroke-width="3" stroke-linecap="round"/>
    `,
  }),
  service: (state) => shell({
    ...state,
    bg: '#FFF4EC',
    border: COLOR.service,
    body: `
      <path d="M32 13 48 22v20L32 51 16 42V22l16-9Z" fill="#FFE3CC" stroke="#F26A1B" stroke-width="2.5"/>
      <path d="M16 22 32 31l16-9M32 31v20" fill="none" stroke="#F26A1B" stroke-width="2.2"/>
    `,
  }),
};

const VISUALS = {
  Go: { key: 'go', label: 'Go', color: COLOR.go, symbol: icons.gopher },
  Spring: { key: 'spring', label: 'Spring', color: COLOR.spring, symbol: icons.spring },
  Java: { key: 'java', label: 'Java', color: COLOR.java, symbol: icons.java },
  Redis: { key: 'redis', label: 'Redis', color: COLOR.redis, symbol: icons.redis },
  Kafka: { key: 'kafka', label: 'Kafka', color: COLOR.kafka, symbol: icons.kafka },
  ClickHouse: { key: 'clickhouse', label: 'ClickHouse', color: '#9A7A00', symbol: icons.clickhouse },
  MySQL: { key: 'mysql', label: 'MySQL', color: COLOR.mysql, symbol: icons.database },
  PostgreSQL: { key: 'postgresql', label: 'PostgreSQL', color: COLOR.mysql, symbol: icons.database },
  MongoDB: { key: 'mongodb', label: 'MongoDB', color: COLOR.mongo, symbol: icons.mongo },
  Elasticsearch: { key: 'elasticsearch', label: 'Elasticsearch', color: '#9A7A00', symbol: icons.elastic },
  RabbitMQ: { key: 'rabbitmq', label: 'RabbitMQ', color: COLOR.mq, symbol: icons.mq },
  RocketMQ: { key: 'rocketmq', label: 'RocketMQ', color: COLOR.mq, symbol: icons.mq },
  Nginx: { key: 'nginx', label: 'Nginx', color: COLOR.nginx, symbol: icons.nginx },
};

const TYPE_VISUALS = {
  datastore: { key: 'database', label: 'Database', color: COLOR.datastore, symbol: icons.database },
  mq: { key: 'mq', label: 'MQ', color: COLOR.mq, symbol: icons.mq },
  external: { key: 'external', label: 'External', color: COLOR.external, symbol: icons.external },
  app: { key: 'service', label: 'Service', color: COLOR.service, symbol: icons.service },
};

function includesAny(value, needles) {
  const normalized = (value || '').toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function byName(name) {
  if (includesAny(name, ['clickhouse'])) return VISUALS.ClickHouse;
  if (includesAny(name, ['redis'])) return VISUALS.Redis;
  if (includesAny(name, ['kafka'])) return VISUALS.Kafka;
  if (includesAny(name, ['rabbitmq'])) return VISUALS.RabbitMQ;
  if (includesAny(name, ['rocketmq'])) return VISUALS.RocketMQ;
  if (includesAny(name, ['nginx'])) return VISUALS.Nginx;
  if (includesAny(name, ['mysql'])) return VISUALS.MySQL;
  if (includesAny(name, ['postgresql', 'postgres'])) return VISUALS.PostgreSQL;
  if (includesAny(name, ['mongodb', 'mongo'])) return VISUALS.MongoDB;
  if (includesAny(name, ['elasticsearch'])) return VISUALS.Elasticsearch;
  return null;
}

export function resolveServiceVisual(service = {}) {
  return byName(service.name) || VISUALS[service.tech] || TYPE_VISUALS[service.type] || TYPE_VISUALS.app;
}
