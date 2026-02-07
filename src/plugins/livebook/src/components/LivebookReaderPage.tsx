import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import {
  Content,
  Header,
  Page,
  Progress,
  WarningPanel,
  Link,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { livebookApiRef, LivebookFile } from '../api';
import {
  makeStyles,
  Theme,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Grid,
  Typography,
} from '@material-ui/core';
import DescriptionIcon from '@material-ui/icons/Description';
import { LivebookViewer } from './LivebookViewer';

const useStyles = makeStyles((theme: Theme) => ({
  fileList: {
    padding: theme.spacing(2),
  },
  selectedFile: {
    backgroundColor: theme.palette.action.selected,
  },
  viewerContainer: {
    padding: theme.spacing(2),
    minHeight: 400,
  },
}));

export const LivebookReaderPage = () => {
  const classes = useStyles();
  const { namespace, kind, name } = useParams<{
    namespace: string;
    kind: string;
    name: string;
  }>();
  const entityRef = `${kind}:${namespace}/${name}`;
  const livebookApi = useApi(livebookApiRef);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const {
    value: files,
    loading,
    error,
  } = useAsync(async () => {
    const result = await livebookApi.getFiles(entityRef);
    if (result.length > 0 && !selectedFile) {
      setSelectedFile(result[0].path);
    }
    return result;
  }, [entityRef]);

  if (loading) {
    return (
      <Page themeId="documentation">
        <Header title={name || 'Livebook'} subtitle={`${kind}:${namespace}/${name}`} />
        <Content>
          <Progress />
        </Content>
      </Page>
    );
  }

  if (error) {
    return (
      <Page themeId="documentation">
        <Header title={name || 'Livebook'} subtitle={`${kind}:${namespace}/${name}`} />
        <Content>
          <WarningPanel title="Failed to load livebooks" message={error.message} />
        </Content>
      </Page>
    );
  }

  return (
    <Page themeId="documentation">
      <Header
        title={`${name} — Livebooks`}
        subtitle={`${kind}:${namespace}/${name}`}
      />
      <Content>
        <Grid container spacing={2}>
          <Grid item xs={3}>
            <Paper className={classes.fileList}>
              <Typography variant="subtitle2" gutterBottom>
                Notebooks
              </Typography>
              <List dense>
                {(files || []).map((file: LivebookFile) => (
                  <ListItem
                    key={file.path}
                    button
                    selected={selectedFile === file.path}
                    onClick={() => setSelectedFile(file.path)}
                  >
                    <ListItemIcon>
                      <DescriptionIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary={file.title || file.name}
                      secondary={file.path}
                    />
                  </ListItem>
                ))}
                {(!files || files.length === 0) && (
                  <ListItem>
                    <ListItemText primary="No livebook files found" />
                  </ListItem>
                )}
              </List>
            </Paper>
          </Grid>
          <Grid item xs={9}>
            <Paper className={classes.viewerContainer}>
              {selectedFile ? (
                <LivebookViewer entityRef={entityRef} filePath={selectedFile} />
              ) : (
                <Typography variant="body1" color="textSecondary">
                  Select a notebook from the left panel.
                </Typography>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
