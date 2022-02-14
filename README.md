
# Stage/unstage particular lines of code in VS Code Git diff editor.

Use context menu on a line at the right or left panel of _(Working Tree)_ or _(Index)_ diff editor to stage/unstage the line. Select lines at any or both panels of the editors and use the context menu to stage/unstage all selected lines at once. 

## Features

- Command <code>'Stage line'</code> / <code>'Unstage line'</code> moves a single line to/from Git Index

- Command <code>'Stage selected lines'</code> / <code>'Unstage selected lines'</code> moves all selected lines to/from Git Index

- Works with the right or left panel of a diff editor for a single line

- Works with selected changes on both panels of a diff editor for multiple lines

- Moves changes to Git Index using _(Working Tree)_ diff editor

- Removes changes from Git Index using _(Index)_ diff editor

## Known Issues

- The extension doesn't use [proposed API](https://code.visualstudio.com/api/advanced-topics/using-proposed-api) to obtain a diff editor current changes, but uses standard <code>Repository.diff()</code> method. The problem is <code>git</code> and VS Code diff editor end up with a _different sets of hunks_ for the same non trivial changes. The extension uses <code>git</code>'s hunks to run commands and diff editor uses its own to visualize, hense at times it's impossible to run stage/unstage command for a 'still changed' line in diff editor.

- The extension uses undocumented (private) **vscode.git** extension API method <code>Repository.stage(resource: Uri, contents: string)</code> to stage arbitrary data into Index. Standard method <code>Repository.add()</code> can't process arbitrary data and <code>Repository.apply()</code> doesn't work with index.

