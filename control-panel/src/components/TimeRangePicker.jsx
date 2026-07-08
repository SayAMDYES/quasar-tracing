/**
 * Time-range selector built around quick ranges, with an inline custom absolute
 * window when users need a precise interval.
 *
 * @author Quasar
 */
import { DatePicker, Segmented, Space } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { CUSTOM_RANGE_KEY, QUICK_RANGES } from '@/context/AppContext';

const { RangePicker } = DatePicker;

export default function TimeRangePicker({ value, range, onChange, onCustomChange, size = 'middle' }) {
  const { t } = useTranslation();
  const options = [
    ...QUICK_RANGES.map((r) => ({ label: r.key, value: r.key })),
    { label: t('range.customShort'), value: CUSTOM_RANGE_KEY },
  ];
  const isCustom = value === CUSTOM_RANGE_KEY;
  const pickerValue = isCustom && range?.from && range?.to ? [dayjs(range.from), dayjs(range.to)] : null;

  const handleModeChange = (nextValue) => {
    if (nextValue === CUSTOM_RANGE_KEY) {
      onCustomChange?.(range.from, range.to);
      return;
    }
    onChange(nextValue);
  };

  return (
    <Space size={6} align="center">
      <Segmented size={size} value={value} onChange={handleModeChange} options={options} />
      {isCustom && (
        <RangePicker
          allowClear={false}
          showTime={{ format: 'HH:mm' }}
          format="MM-DD HH:mm"
          inputReadOnly
          value={pickerValue}
          placeholder={[t('range.start'), t('range.end')]}
          onChange={(dates) => {
            if (!dates?.[0] || !dates?.[1]) return;
            onCustomChange?.(dates[0].valueOf(), dates[1].valueOf());
          }}
        />
      )}
    </Space>
  );
}
