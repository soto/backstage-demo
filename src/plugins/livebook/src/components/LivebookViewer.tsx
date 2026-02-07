import React, { useState } from 'react';
import { useAsync } from 'react-use';
import { useApi } from '@backstage/core-plugin-api';
import { livebookApiRef, LivebookInstanceConfig } from '../api';
import { Progress, WarningPanel } from '@backstage/core-components';
import {
  makeStyles,
  Theme,
  Typography,
  Chip,
  Box,
  Button,
  ButtonGroup,
  Tooltip,
  IconButton,
} from '@material-ui/core';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import VisibilityIcon from '@material-ui/icons/Visibility';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import FiberManualRecordIcon from '@material-ui/icons/FiberManualRecord';

type ViewMode = 'preview' | 'interactive';

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    fontFamily: theme.typography.fontFamily,
  },
  header: {
    marginBottom: theme.spacing(2),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  badge: {
    backgroundColor: '#4e2a8e',
    color: '#fff',
  },
  instanceBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  connectedDot: {
    color: '#4caf50',
    fontSize: 12,
  },
  disconnectedDot: {
    color: theme.palette.grey[400],
    fontSize: 12,
  },
  iframe: {
    width: '100%',
    height: 'calc(100vh - 300px)',
    minHeight: 600,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
  },
  noInstance: {
    textAlign: 'center',
    padding: theme.spacing(4),
    color: theme.palette.text.secondary,
  },
  content: {
    '& h1': {
      ...theme.typography.h4,
      borderBottom: `1px solid ${theme.palette.divider}`,
      paddingBottom: theme.spacing(1),
      marginTop: theme.spacing(3),
      marginBottom: theme.spacing(2),
    },
    '& h2': {
      ...theme.typography.h5,
      marginTop: theme.spacing(3),
      marginBottom: theme.spacing(1.5),
    },
    '& h3': {
      ...theme.typography.h6,
      marginTop: theme.spacing(2),
      marginBottom: theme.spacing(1),
    },
    '& p': {
      ...theme.typography.body1,
      marginBottom: theme.spacing(1.5),
    },
    '& pre': {
      backgroundColor: theme.palette.type === 'dark' ? '#1e1e1e' : '#f5f5f5',
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: theme.shape.borderRadius,
      padding: theme.spacing(2),
      overflow: 'auto',
      fontFamily: '"Roboto Mono", "Courier New", monospace',
      fontSize: '0.875rem',
      lineHeight: 1.6,
      marginBottom: theme.spacing(2),
    },
    '& code': {
      fontFamily: '"Roboto Mono", "Courier New", monospace',
      fontSize: '0.875rem',
    },
    '& :not(pre) > code': {
      backgroundColor: theme.palette.type === 'dark' ? '#2d2d2d' : '#efefef',
      padding: '2px 6px',
      borderRadius: 3,
    },
    '& .livebook-elixir-cell': {
      borderLeft: `4px solid #4e2a8e`,
      marginBottom: theme.spacing(2),
      borderRadius: theme.shape.borderRadius,
    },
    '& .livebook-elixir-cell pre': {
      borderLeft: 'none',
      marginBottom: 0,
    },
    '& .livebook-cell-label': {
      display: 'inline-block',
      backgroundColor: '#4e2a8e',
      color: '#fff',
      padding: '2px 8px',
      fontSize: '0.75rem',
      fontWeight: 600,
      borderRadius: `${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0 0`,
    },
    '& .livebook-output': {
      backgroundColor: theme.palette.type === 'dark' ? '#1a2e1a' : '#f0faf0',
      borderLeft: `4px solid #4caf50`,
      padding: theme.spacing(1.5),
      marginBottom: theme.spacing(2),
      borderRadius: theme.shape.borderRadius,
      fontFamily: '"Roboto Mono", "Courier New", monospace',
      fontSize: '0.875rem',
      whiteSpace: 'pre-wrap',
    },
    '& .livebook-setup-cell': {
      opacity: 0.7,
      borderLeft: `4px solid ${theme.palette.grey[400]}`,
    },
    '& ul, & ol': {
      marginBottom: theme.spacing(1.5),
      paddingLeft: theme.spacing(3),
    },
    '& li': {
      ...theme.typography.body1,
      marginBottom: theme.spacing(0.5),
    },
    '& blockquote': {
      borderLeft: `4px solid ${theme.palette.divider}`,
      margin: theme.spacing(1.5, 0),
      padding: theme.spacing(0.5, 2),
      color: theme.palette.text.secondary,
    },
    '& table': {
      borderCollapse: 'collapse',
      width: '100%',
      marginBottom: theme.spacing(2),
    },
    '& th, & td': {
      border: `1px solid ${theme.palette.divider}`,
      padding: theme.spacing(1),
      textAlign: 'left',
    },
    '& th': {
      backgroundColor: theme.palette.type === 'dark' ? '#2d2d2d' : '#fafafa',
      fontWeight: 600,
    },
    '& img': {
      maxWidth: '100%',
    },
    '& a': {
      color: theme.palette.primary.main,
    },
  },
}));

interface LivebookViewerProps {
  entityRef: string;
  filePath: string;
}

export const LivebookViewer = ({ entityRef, filePath }: LivebookViewerProps) => {
  const classes = useStyles();
  const livebookApi = useApi(livebookApiRef);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');

  // Fetch Livebook instance config
  const { value: instanceConfig } = useAsync(
    () => livebookApi.getConfig(),
    [],
  );

  // Fetch Livebook instance status (only if configured)
  const { value: instanceStatus } = useAsync(async () => {
    if (!instanceConfig?.available) return undefined;
    return livebookApi.getInstanceStatus();
  }, [instanceConfig?.available]);

  // Fetch the .livemd content (for static preview)
  const {
    value: content,
    loading,
    error,
  } = useAsync(
    () => livebookApi.getContent(entityRef, filePath),
    [entityRef, filePath],
  );

  if (loading) return <Progress />;
  if (error) {
    return (
      <WarningPanel title="Failed to load livebook" message={error.message} />
    );
  }
  if (!content) return null;

  const livebookAvailable = instanceConfig?.available ?? false;
  const iframeEnabled = instanceConfig?.iframe?.enabled ?? false;
  const isConnected = instanceStatus?.connected ?? false;

  return (
    <div className={classes.root}>
      <Box className={classes.header}>
        <Box className={classes.headerLeft}>
          <Typography variant="h5">{content.title}</Typography>
          <Chip label="Livebook" size="small" className={classes.badge} />
          {livebookAvailable && (
            <Tooltip
              title={
                isConnected
                  ? `Connected to ${instanceConfig!.baseUrl}`
                  : 'Livebook instance not reachable'
              }
            >
              <Box className={classes.instanceBadge}>
                <FiberManualRecordIcon
                  className={
                    isConnected
                      ? classes.connectedDot
                      : classes.disconnectedDot
                  }
                />
                <Typography variant="caption">
                  {isConnected ? 'Live' : 'Offline'}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>

        <Box className={classes.headerRight}>
          {/* Mode toggle: preview vs interactive (iframe) */}
          {livebookAvailable && iframeEnabled && (
            <ButtonGroup size="small" variant="outlined">
              <Tooltip title="Static preview of the notebook">
                <Button
                  onClick={() => setViewMode('preview')}
                  variant={viewMode === 'preview' ? 'contained' : 'outlined'}
                  startIcon={<VisibilityIcon />}
                >
                  Preview
                </Button>
              </Tooltip>
              <Tooltip title="Interactive Livebook session (iframe)">
                <Button
                  onClick={() => setViewMode('interactive')}
                  variant={
                    viewMode === 'interactive' ? 'contained' : 'outlined'
                  }
                  startIcon={<PlayArrowIcon />}
                  disabled={!isConnected}
                >
                  Interactive
                </Button>
              </Tooltip>
            </ButtonGroup>
          )}

          {/* "Open in Livebook" button — redirects to Livebook's import URL */}
          {content.importUrl && (
            <Tooltip title="Open this notebook in Livebook for interactive editing">
              <Button
                size="small"
                variant="contained"
                style={{ backgroundColor: '#4e2a8e', color: '#fff' }}
                href={content.importUrl}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<OpenInNewIcon />}
              >
                Open in Livebook
              </Button>
            </Tooltip>
          )}

          {/* "Run in Livebook" badge link (livebook.dev/run) */}
          {!content.importUrl && content.runBadgeUrl && (
            <Tooltip title="Open via livebook.dev — connects to your personal Livebook instance">
              <Button
                size="small"
                variant="outlined"
                href={content.runBadgeUrl}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<PlayArrowIcon />}
              >
                Run in Livebook
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Interactive mode: embed Livebook in an iframe */}
      {viewMode === 'interactive' &&
      iframeEnabled &&
      isConnected &&
      content.importUrl ? (
        <iframe
          className={classes.iframe}
          src={content.importUrl}
          title={`Livebook: ${content.title}`}
          allow="clipboard-read; clipboard-write"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      ) : (
        /* Preview mode: static HTML render of the .livemd */
        <div
          className={classes.content}
          dangerouslySetInnerHTML={{ __html: content.contentHtml }}
        />
      )}
    </div>
  );
};
