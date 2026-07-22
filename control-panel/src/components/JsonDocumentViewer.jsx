/**
 * Virtualized fixed-height viewer for canonical JSON text.
 *
 * @author Quasar
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Space, Spin, Tooltip, Typography } from 'antd';
import {
  CopyOutlined,
  DownloadOutlined,
  EnterOutlined,
  SearchOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  getVisibleSegmentRange,
  getVisualSegments,
  mapTextOffsetToSegment,
} from '@/utils/jsonDocumentSegments';

const ROW_HEIGHT = 20;

function measureLayout(element) {
  if (!element) return { containerWidth: 720, characterWidth: 8, viewportHeight: 480 };
  const style = window.getComputedStyle(element);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (context) {
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  }
  return {
    containerWidth: Math.max(0, element.clientWidth - 72),
    characterWidth: context?.measureText('0').width || 8,
    viewportHeight: element.clientHeight,
  };
}

function highlightedText(segment, matchOffset, matchLength) {
  if (matchOffset == null || matchLength === 0) return segment.text;
  const matchEnd = matchOffset + matchLength;
  const overlapStart = Math.max(segment.startOffset, matchOffset);
  const overlapEnd = Math.min(segment.endOffset, matchEnd);
  if (overlapStart >= overlapEnd) return segment.text;
  const start = overlapStart - segment.startOffset;
  const end = overlapEnd - segment.startOffset;
  return (
    <>
      {segment.text.slice(0, start)}
      <mark className="json-document-match">{segment.text.slice(start, end)}</mark>
      {segment.text.slice(end)}
    </>
  );
}

export default function JsonDocumentViewer({
  text,
  workerClient,
  onCopy,
  onDownload,
  copying = false,
  downloading = false,
}) {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const indexRef = useRef(null);
  const [wrap, setWrap] = useState(false);
  const [layout, setLayout] = useState({
    containerWidth: 720,
    characterWidth: 8,
    viewportHeight: 480,
  });
  const [index, setIndex] = useState(null);
  const [indexError, setIndexError] = useState(null);
  const [indexAttempt, setIndexAttempt] = useState(0);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState({ offsets: [], total: 0, truncated: false });
  const [currentMatch, setCurrentMatch] = useState(-1);
  const [searchError, setSearchError] = useState(null);

  const updateRange = useCallback((targetIndex = indexRef.current) => {
    const element = scrollRef.current;
    if (!element || !targetIndex) return;
    setRange(getVisibleSegmentRange({
      scrollTop: element.scrollTop,
      viewportHeight: element.clientHeight,
      rowHeight: ROW_HEIGHT,
      segmentCount: targetIndex.segmentCount,
    }));
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const updateLayout = () => setLayout((current) => {
      const next = measureLayout(element);
      return Math.abs(current.containerWidth - next.containerWidth) < 1
        && Math.abs(current.characterWidth - next.characterWidth) < 0.1
        && current.viewportHeight === next.viewportHeight ? current : next;
    });
    updateLayout();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateLayout);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let current = true;
    setIndexError(null);
    setIndex(null);
    indexRef.current = null;
    workerClient.segmentJson(text, {
      wrap,
      containerWidth: layout.containerWidth,
      characterWidth: layout.characterWidth,
    }).then((nextIndex) => {
      if (!current) return;
      indexRef.current = nextIndex;
      setIndex(nextIndex);
      updateRange(nextIndex);
    }).catch((error) => {
      if (!current) return;
      setIndexError(error);
    });
    return () => { current = false; };
  }, [text, wrap, layout.containerWidth, layout.characterWidth, indexAttempt, workerClient, updateRange]);

  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      workerClient.searchJson(text, query).then((result) => {
        if (!current) return;
        setMatches(result);
        setCurrentMatch(result.offsets.length > 0 ? 0 : -1);
        setSearchError(null);
      }).catch((error) => {
        if (!current) return;
        setMatches({ offsets: [], total: 0, truncated: false });
        setCurrentMatch(-1);
        setSearchError(error);
      });
    }, 180);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query, text, workerClient]);

  useEffect(() => {
    if (!index || currentMatch < 0 || matches.offsets[currentMatch] === undefined) return;
    const segment = mapTextOffsetToSegment(index, matches.offsets[currentMatch], text);
    if (segment < 0 || !scrollRef.current) return;
    scrollRef.current.scrollTop = segment * ROW_HEIGHT;
    updateRange(index);
  }, [currentMatch, index, matches.offsets, text, updateRange]);

  const moveMatch = (direction) => {
    if (matches.offsets.length === 0) return;
    setCurrentMatch((current) => (
      (current + direction + matches.offsets.length) % matches.offsets.length
    ));
  };
  const visibleSegments = useMemo(() => (
    index ? getVisualSegments(text, index, range.start, range.end) : []
  ), [index, range.end, range.start, text]);
  const matchOffset = currentMatch >= 0 ? matches.offsets[currentMatch] : null;
  const matchCount = matches.truncated ? `${matches.total}+` : String(matches.total);

  return (
    <div className="json-document-viewer">
      <div className="json-document-toolbar">
        <Input
          className="json-document-search"
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('traceDetail.jsonSearch')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Typography.Text className="json-document-match-count" type="secondary" aria-live="polite">
          {currentMatch >= 0
            ? t('traceDetail.jsonMatchCount', { current: currentMatch + 1, total: matchCount })
            : t('traceDetail.jsonNoMatches')}
        </Typography.Text>
        <Space.Compact>
          <Tooltip title={t('traceDetail.jsonPreviousMatch')}>
            <Button
              icon={<UpOutlined />}
              aria-label={t('traceDetail.jsonPreviousMatch')}
              disabled={matches.offsets.length === 0}
              onClick={() => moveMatch(-1)}
            />
          </Tooltip>
          <Tooltip title={t('traceDetail.jsonNextMatch')}>
            <Button
              icon={<DownOutlined />}
              aria-label={t('traceDetail.jsonNextMatch')}
              disabled={matches.offsets.length === 0}
              onClick={() => moveMatch(1)}
            />
          </Tooltip>
        </Space.Compact>
        <span className="json-document-toolbar-spacer" />
        <Tooltip title={t('traceDetail.jsonWrap')}>
          <Button
            type={wrap ? 'primary' : 'default'}
            icon={<EnterOutlined />}
            aria-label={t('traceDetail.jsonWrap')}
            aria-pressed={wrap}
            onClick={() => setWrap((value) => !value)}
          />
        </Tooltip>
        <Tooltip title={t('traceDetail.jsonCopy')}>
          <Button
            icon={<CopyOutlined />}
            aria-label={t('traceDetail.jsonCopy')}
            loading={copying}
            disabled={downloading}
            onClick={onCopy}
          />
        </Tooltip>
        <Tooltip title={t('traceDetail.jsonDownload')}>
          <Button
            icon={<DownloadOutlined />}
            aria-label={t('traceDetail.jsonDownload')}
            loading={downloading}
            disabled={copying}
            onClick={onDownload}
          />
        </Tooltip>
      </div>

      {searchError && <Alert type="error" showIcon message={searchError.message} />}
      {indexError && (
        <Alert
          type="error"
          showIcon
          message={indexError.message}
          action={<Button size="small" onClick={() => setIndexAttempt((value) => value + 1)}>{t('common.retry')}</Button>}
        />
      )}

      <div
        ref={scrollRef}
        className={`json-document-scroll${wrap ? ' is-wrapped' : ''}`}
        aria-label={t('traceDetail.jsonViewer')}
        tabIndex={0}
        onScroll={() => updateRange()}
      >
        {!index && !indexError ? (
          <div className="json-document-loading"><Spin /></div>
        ) : index && (
          <div className="json-document-canvas" style={{ height: index.segmentCount * ROW_HEIGHT }}>
            {visibleSegments.map((segment, offset) => {
              const segmentNumber = range.start + offset;
              return (
                <div
                  className="json-document-row"
                  key={segmentNumber}
                  style={{ top: segmentNumber * ROW_HEIGHT, height: ROW_HEIGHT }}
                >
                  <span className="json-document-line-number">
                    {segment.startCodePoint === 0 ? segment.logicalLine + 1 : ''}
                  </span>
                  <code>{highlightedText(segment, matchOffset, query.length)}</code>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
