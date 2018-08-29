import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { TrixEditor } from 'react-trix';

import INITIAL_CONFIG from '../data/editorConfig';
import { SEND_TO_NOTES, FROM_BLANK_NOTE } from '../utils/constants';
import { getPadStats, customizeEditor } from '../utils/editor';

import { updateNote, createNote, deleteNote, setFocusedNote } from '../actions';

console.log("Editor.js loaded");

const styles = {
  container: {
    flex: '100%',
    display: 'flex',
    flexDirection: 'column'
  }
};

class Editor extends React.Component {
  constructor(props, context) {
    super(props);
    this.props = props;
    this.editor = null; // Editor object
    this.ignoreChange = false;
    this.delayUpdateNote = null;

    this.sendToNoteListener = (eventData) => {
      if (eventData.action === SEND_TO_NOTES) {
        browser.windows.getCurrent({populate: true}).then((windowInfo) => {
          if (windowInfo.id === eventData.windowId) {
            let content = this.editor.toJSON();
            console.log("my content?", content);
            if (content === '<p>&nbsp;</p>') content = '';
            this.editor.setData(content + `<p>${eventData.text}</p>`);
          }
        });
      }
    };
  }

  componentDidMount() {
    false && ClassicEditor.create(this.node, INITIAL_CONFIG)
      .then(editor => {
        this.editor = editor;

        chrome.runtime.onMessage.addListener(this.sendToNoteListener);

        customizeEditor(editor);

        // Focus the text editor
        this.editor.editing.view.focus();

        editor.model.document.on('change', (eventInfo, name) => {
          // Cache update event in case of multi-change event (copy pasting trigger many).
          clearTimeout(this.delayUpdateNote);
          this.delayUpdateNote = setTimeout(() => {

            const isFocused = document
              .querySelector('.ck-editor__editable')
              .classList.contains('ck-focused');
            // Only use the focused editor or handle 'rename' events to set the data into storage.
            if (isFocused || name === 'rename' || name === 'insert' || name.type && name.type === 'transparent') {
                const content = editor.getData();

                if (!this.ignoreChange) {
                  if (content !== '' && content !== '<p>&nbsp;</p>') {
                    if (!this.props.note.id) {
                      this.props.dispatch(createNote(content, this.props.origin)).then(id => {
                        this.props.dispatch(setFocusedNote(id));
                      });
                    } else {
                      this.props.dispatch(updateNote(this.props.note.id, content));
                    }
                  } else {
                    if (this.props.note.id) {
                      this.props.dispatch(deleteNote(this.props.note.id, FROM_BLANK_NOTE));
                    }
                  }
                }
                this.ignoreChange = false;

                chrome.runtime.sendMessage({
                  action: 'metrics-changed',
                  context: getPadStats(editor)
                });
            }
            this.delayUpdateNote = null;
          }, 50);
        });
      })
      .catch(error => {
        console.error(error); // eslint-disable-line no-console
      });
  }

  // This is triggered when redux update state.
  componentWillReceiveProps(nextProps) {
    if (this.editor && this.props.note &&
        this.editor.getData() !== nextProps.note.content) {
      if (nextProps.note.id !== this.props.note.id) {
        this.ignoreChange = true;
      }
      if (!this.delayUpdateNote) { // If no delay waiting, we apply modification
        this.ignoreChange = true;
        // FIXME: set the selection to all, I guess?
        console.log("trying to insert HTML", nextProps.note.content);
        this.editor.insertHTML(nextProps.note.content || '<p></p>');
        // this.editor.setData(nextProps.note.content || '<p></p>');
        // this.editor.editing.view.focus();
      }
    }
  }

  componentWillUnmount() {
    chrome.runtime.onMessage.removeListener(this.sendToNoteListener);

    if (this.editor) {
      this.editor.destroy();
    }
  }

  handleEditorReady(editor) {
    // this is a reference back to the editor if you want to
    // do editing programatically
    this.editor = editor;
    chrome.runtime.onMessage.addListener(this.sendToNoteListener);
  }

  handleChange(html, text) {
    // console.log("got change", html, text);
  }

  render() {
    return (
      <div style={styles.container}>
        <div className="editorWrapper">
          <TrixEditor onChange={this.handleChange.bind(this)} onEditorReady={this.handleEditorReady.bind(this)} autofocus={true} value={this.props.note.content} />;
        </div>
      </div>
    );
    /*
    return (
      <div style={styles.container}>
        <div className="editorWrapper">
          <div
            id="editor"
            ref={node => {
              this.node = node;
            }}
            dangerouslySetInnerHTML={{ __html: this.props.note ? this.props.note.content : '' }}>
          </div>
        </div>

      </div>
    );
    */
  }
}

// We can reuse notification in editorWrapper using the following :
// <div id="sync-note">
//   <button onClick={this.closeNotification}><CloseIcon /></button>
//   <p>{ browser.i18n.getMessage('maximumPadSizeExceeded') }</p>
// </div>

function mapStateToProps(state) {
  return {
    state
  };
}

Editor.propTypes = {
    state: PropTypes.object.isRequired,
    history: PropTypes.object.isRequired,
    origin: PropTypes.string.isRequired,
    note: PropTypes.object,
    dispatch: PropTypes.func.isRequired
};

export default connect(mapStateToProps)(Editor);
