// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {parseXml} from "@rgrove/parse-xml";
import {createTableView} from "./tableview";
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import {XmlDocument, XmlElement, XmlText} from "@rgrove/parse-xml";
import {NodeData} from "./types";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const toggleViewCommand = 'psViewer.toggleView';
    const vsConfig = vscode.workspace.getConfiguration('psViewer');
    const config: any = {};
    let panel: vscode.WebviewPanel;
    // Support variables for xml convert
    const headers: Map<string, string[]> = new Map<string, string[]>();
    const globalRows: Map<string, any[]> = new Map<string, any[]>();
    const types: string[] = [];

    // Access individual settings
    config.recordsPerPage = vsConfig.get<number>('defaultRecordsPerPage');
    config.colOrder = vsConfig.get<string>('defaultColOrder');
    config.addColor = vsConfig.get<string>('blockAddColor');
    config.removeColor = vsConfig.get<string>('blockRemoveColor');
    config.changeColor = vsConfig.get<string>('blockChangeColor');
    config.textColor = vsConfig.get<string>('blockTextColor');

    const extractFileName = (fileName: string) => {
        return fileName.split('/').pop()?.split('.').shift();
    };

    function xmlToDataArray(node: NodeData, currentPath: string[] = [], key: string): void {
        if (!globalRows.has(key)) {
            globalRows.set(key, []);
        }
        let rows = globalRows.get(key) as any[];
        currentPath = [...currentPath];
        if ((node as any)?.name) {
            currentPath.push((node as any).name);
        }
        if (node instanceof XmlDocument) {
            if (node.children.length <= 0) {
                return;
            }
            node.children.forEach((child) => {
                xmlToDataArray(child, currentPath, key);
            });
        } else if (node instanceof XmlElement) {
            if (node.isRootNode) {
                if (node.name.toLowerCase() !== 'permissionset') {
                    if (panel) {
                        panel.dispose();
                    }
                    throw new Error('Tao chỉ hỗ trợ PermissionSet =.,="');
                }
                node.children.forEach((child) => {
                    xmlToDataArray(child, currentPath, key);
                });
                return;
            }
            if (node.children.length <= 0) {
                return;
            }
            let data: any;
            switch (node.name) {
                case 'description':
                    break;
                case 'hasActivationRequired':
                case 'label':
                case 'license':
                case 'userLicense':
                    if (!types.includes(node.name)) {
                        types.push(node.name);
                    }
                    if (!headers.has(node.name)) {
                        headers.set(node.name, []);
                    }
                    if (!headers.get(node.name)?.includes('value')) {
                        headers.get(node.name)?.push('value');
                    }
                    data = { type: node.name };
                    data.value = (node.children[0] as XmlText)?.text;
                    rows.push(data);
                    break;
                default:
                    if (!types.includes(node.name)) {
                        types.push(node.name);
                    }
                    data = { type: node.name };
                    node.children.forEach((l1) => {
                        if (!(l1 instanceof XmlElement)) {
                            return;
                        }
                        const configName = (l1 as XmlElement).name;
                        if (!headers.has(node.name)) {
                            headers.set(node.name, []);
                        }
                        if (!headers.get(node.name)?.includes(configName)) {
                            headers.get(node.name)?.push(configName);
                        }
                        data[configName] = ((l1 as XmlElement).children[0] as XmlText)?.text;
                    });
                    rows.push(data);
                    break;
            }
        } else if (node instanceof XmlText) {
            if (/[\r\n]/.exec(node.text)) {
                return;
            }
        }
    }

    function clearData() {
        globalRows.clear();
        headers.clear();
        types.splice(0, types.length);
    }

    const disposable = vscode.commands.registerCommand(toggleViewCommand, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'xml') {
            vscode.window.showErrorMessage('The file is not an XML file.');
            return;
        }

        const content = document.getText();
        const fileName = extractFileName(document.fileName);

        // Switch to table view
        panel = vscode.window.createWebviewPanel(
            'psViewer',
            fileName + ' | PermissionSet Viewer',
            vscode.ViewColumn.One,
            {
                enableScripts: true, // Allow running scripts in the webview
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(context.extensionPath + '/dist/css'), // Allow access to the media folder
                    vscode.Uri.file(context.extensionPath + '/dist/scripts') // Allow access to the media folder
                ],
            }
        );

        panel.webview.onDidReceiveMessage(
            (message) => {
                try {
                    if (message.type === 'edit') {
                        // Handle XML editing logic here
                        console.log(`Edited key: ${message.key}, new value: ${message.value}`);
                        // Update the XML content
                    } else if (message.type === 'init') {
                        clearData();
                        xmlToDataArray(parseXml(content), undefined, document.fileName || '');
                        panel.webview.postMessage({
                            command: 'init',
                            data: { headers: Object.fromEntries(headers), globalRows: Object.fromEntries(globalRows), types, config }
                        });
                    } else if (message.type === 'compare') {
                        clearData();

                        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        const activeFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;
                        const workingDir = workspaceFolder || (activeFilePath ? path.dirname(activeFilePath) : process.cwd());

                        if (!workingDir) {
                            vscode.window.showErrorMessage('Could not determine the working directory.');
                            return;
                        }

                        const fileName = extractFileName(message.value.fileName);
                        const metadataType = 'PermissionSet';

                        // Pull metadata from Salesforce
                        const outputDir = './minaide';
                        const retrieveCmd = `sf force source retrieve -m ${metadataType}:${fileName} -r ${outputDir} --json`;

                        vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: `Pulling metadata: ${fileName} (${metadataType})`,
                            cancellable: false
                        }, async (progress, token) => {
                            return new Promise<void>((resolve, reject) => {
                                exec(retrieveCmd, { cwd: workingDir }, async (error, stdout, stderr) => {
                                    if (error) {
                                        vscode.window.showErrorMessage(`Metadata pull failed: ${stderr}`);
                                        reject(`Error pulling metadata: ${stderr}`);
                                        panel.webview.postMessage({
                                            command: 'compare-content'
                                        });
                                        return;
                                    }
                                    resolve();
                                    vscode.window.showInformationMessage(`Pull success: ${fileName} (${metadataType})`);

                                    const response = JSON.parse(stdout);
                                    const sandboxFilePath = response.result.inboundFiles.shift()?.filePath || '';
                                    const sandboxContent = fs.readFileSync(sandboxFilePath, 'utf-8');
                                    if (globalRows.has(sandboxFilePath)) {
                                        globalRows.set(sandboxFilePath, []);
                                    }
                                    xmlToDataArray(parseXml(sandboxContent), undefined, sandboxFilePath);

                                    // Send sandbox content to Webview
                                    panel.webview.postMessage({
                                        command: 'compare-content',
                                        data: { headers: Object.fromEntries(headers), rows: globalRows.get(sandboxFilePath), types, config }
                                    });
                                });
                            });
                        });
                    }
                } catch (e: any) {
                    vscode.window.showErrorMessage(e.message);
                }
            },
            undefined,
            context.subscriptions
        );

        // Get the local resource URIs
        const datatable = panel.webview.asWebviewUri(
            vscode.Uri.file(context.extensionPath + '/dist/scripts/datatables.min.js')
        );
        const fixedheader = panel.webview.asWebviewUri(
            vscode.Uri.file(context.extensionPath + '/dist/scripts/fixedheader.min.js')
        );
        const jquery = panel.webview.asWebviewUri(
            vscode.Uri.file(context.extensionPath + '/dist/scripts/jquery-3.7.1.min.js')
        );
        const rowgroup = panel.webview.asWebviewUri(
            vscode.Uri.file(context.extensionPath + '/dist/scripts/rowgroup.datatables.js')
        );
        const datatableCss = panel.webview.asWebviewUri(
            vscode.Uri.file(context.extensionPath + '/dist/css/datatables.min.css')
        );
        const fixedheaderCss = panel.webview.asWebviewUri(
            vscode.Uri.file(context.extensionPath + '/dist/css/fixedheader.min.css')
        );
        const vscodeCss = panel.webview.asWebviewUri(
            vscode.Uri.file(context.extensionPath + '/dist/css/vscode.css')
        );

        panel.webview.html = createTableView({ datatable, fixedheader, jquery, rowgroup, datatableCss, fixedheaderCss, vscodeCss }, document.fileName || '', config);
    });

    context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
