import React, { useState } from 'react';
import { useAsync } from 'react-use';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useApi } from '@backstage/core-plugin-api';
import { livebookApiRef, LivebookFile } from '../api';
import {
  Progress,
  WarningPanel,
  EmptyState,
  Link,
} from '@backstage/core-components';
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
  Button,
} from '@material-ui/core';
import DescriptionIcon from '@material-ui/icons/Description';
import { LivebookViewer } from './LivebookViewer';

const ANNOTATION_LIVEBOOK_REF = 'livebook.dev/ref';

const useStyles = makeStyles((theme: Theme) => ({
  fileList: {
    padding: theme.spacing(2),
    height: '100%',
  },
  viewerContainer: {
    padding: theme.spacing(2),
    minHeight: 400,
    height: '100%',
  },
}));

export const EntityLivebookContent = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const livebookApi = useApi(livebookApiRef);
  const entityRef = stringifyEntityRef(entity);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const livebookAnnotation =
    entity.metadata.annotations?.[ANNOTATION_LIVEBOOK_REF];

  const {
    value: files,
    loading,
    error,
  } = useAsync(async () => {
    if (!livebookAnnotation) return [];
    const result = await livebookApi.getFiles(entityRef);
    if (result.length > 0 && !selectedFile) {
      setSelectedFile(result[0].path);
    }
    return result;
  }, [entityRef, livebookAnnotation]);

  if (!livebookAnnotation) {
    return (
      <EmptyState
        title="No Livebooks configured"
        missing="info"
        description={`Add the annotation "livebook.dev/ref" to this entity to enable Livebook notebooks.`}
        action={
          <Button
            variant="contained"
            color="primary"
            href="https://livebook.dev"
            target="_blank"
          >
            Learn about Livebook
          </Button>
        }
      />
    );
  }

  if (loading) return <Progress />;
  if (error) {
    return (
      <WarningPanel title="Failed to load livebooks" message={error.message} />
    );
  }

  if (!files || files.length === 0) {
    return (
      <EmptyState
        title="No livebook files found"
        missing="data"
        description="No .livemd files were found at the configured location."
      />
    );
  }

  return (
    <Grid container spacing={2}>
      <Grid item xs={3}>
        <Paper className={classes.fileList}>
          <Typography variant="subtitle2" gutterBottom>
            Notebooks
          </Typography>
          <List dense>
            {files.map((file: LivebookFile) => (
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
  );
};
