export function createTableView(e: any, fileName: string, config: any): string {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <link rel="stylesheet" href="${e.vscodeCss}">
            <link rel="stylesheet" href="${e.datatableCss}">
            <link rel="stylesheet" href="${e.fixedheaderCss}">
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
                table { width: 100%; }
                .menu { margin-left: 5px; }
                hr.solid { border-top: 1px solid #bbb; }
                .wrapper { margin: 20px; padding: 10px; border: 1px solid #bbb; border-radius: 5px; overflow: auto; }
                .xmlTable {
                    display: none;
                    .remove { background-color: ${config.removeColor}; color: ${config.textColor} }
                    .add { background-color: ${config.addColor}; color: ${config.textColor} }
                    .change { background-color: ${config.changeColor}; color: ${config.textColor} }
                }
                .block-header { font-weight: bold; }
                table.fixedHeader-floating, table.fixedHeader-locked { background-color: var(--vscode-editor-background); }
                .tooltip {
                    position: relative;
                }

                .tooltip .tooltiptext {
                    visibility: hidden;
                    max-width: 300px; /* Optional: Limit width for long tooltips */
                    background-color: rgba(60, 60, 60, 0.9); /* Semi-transparent dark for dark/light mode */
                    color: #ffffff; /* White text for readability */
                    text-align: center;
                    padding: 8px;
                    border-radius: 6px;
                    position: absolute;
                    z-index: 1;
                    bottom: 125%; /* Adjust to position above the cell */
                    left: 50%;
                    transform: translateX(-50%);
                    opacity: 0;
                    transition: opacity 0.3s;
                    white-space: nowrap; /* Prevent text wrapping */
                    box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.2); /* Subtle shadow for visibility */
                }

                .tooltip:hover .tooltiptext {
                    visibility: visible;
                    opacity: 1;
                }

                @media (prefers-color-scheme: light) {
                    .tooltip .tooltiptext {
                        background-color: rgba(255, 255, 255, 0.9); /* Light background for light mode */
                        color: #000000; /* Black text for readability in light mode */
                        border: 1px solid #ccc; /* Subtle border to distinguish tooltip */
                    }
                }
                .wrapper:has(table .change), 
                .wrapper:has(table .add), 
                .wrapper:has(table .remove) {
                    border: 2px solid orange;
                }
            </style>
            <title></title>
        </head>
        <body>
            <div class='wrapper'>
                <button id='compare-button'>Cmp w/sandbox</button>
            </div>
            <div id='menu-gen'></div>
            <div id='table-gen'></div>

            <script src="${e.jquery}"></script>
            <script src="${e.datatable}"></script>
            <script src="${e.fixedheader}"></script>
            <script>
                const vscode = acquireVsCodeApi();
                let origin;
                let globalRows;
                let headers;
                let types;

                // Helper
                function renderTableHeaders(type, headers) {
                    return headers.get(type)?.map(rk => {
                        const [k, s] = rk.split('#');
                        return '<th class="' + s + '">' + k + '</th>';
                    }).join('') || '';
                }
                function renderTableRows(type, data, headers) {
                    if (Array.isArray(data)) {
                        return data.filter(d => d.type === type).map(d => {
                            let rowState = '';
                            const tds = headers.get(type)?.map(rk => {
                                const [k, s] = rk.split('#');
                                const [v, vs, nv] = !d[k] ? [] : d[k].split('#');
                                if (!rowState && vs) {
                                    rowState = vs;
                                }
                                return '<td class="tooltip ' + rowState + '">' + (v || '') + (nv ? ('<span class="tooltiptext">' + nv + '</span>') : '') + '</td>';
                            }).join('');
                            return '<tr class="' + (d.remove ? 'remove' : (d.add ? 'add' : '')) + '">' + tds + '</tr>';
                        }).join('');
                    }
                    return '<tr><td>' + data + '</td></tr>';
                }
                function renderTable(rows, types, headers, config) {
                    return types.map((rawType, i) => {
                        const [type, state] = rawType.split('#');
                        let rs = '';
                        if (headers.get(type)?.length === 1 && headers.get(type)[0] === 'value') {
                            rs += "<div id='" + type.toLowerCase() + "' class='wrapper'><span class='block-header " + state + "'>" + type.toUpperCase() + "</span> : <span>" + rows.filter(d => d.type === type)[0].value + "</span></div>";
                        } else {
                            rs += '<div class="wrapper" id="' + type.toLowerCase() + '"><div class="block-header ' + state + '">' + type.toUpperCase() + '</div><hr class="solid"><table class="xmlTable" data-page-length="' + config.recordsPerPage + '"><thead><tr>' + renderTableHeaders(type, headers) + '<tbody>' + renderTableRows(type, rows, headers) + '</table></div>';
                        }
                        return rs;
                    }).join('');
                }
                function renderMenu(types) {
                    let rs = '<div class="wrapper">';
                    rs += types.map(rawType => {
                        const [type, state] = rawType.split('#');
                        return \`
                            <span class='menu \` + type.toLowerCase() + \`'>
                                <a href='#\` + type.toLowerCase() + \`'>\` + type.toUpperCase() + \`</a>
                            </span>
                        \`;
                    }).join('');
                    rs += '</div>';
                    return rs;
                }
                function compareRows(rows, newTypes, newHeaders, config) {
                    const oldHeaders = headers;
                    headers = new Map();
                    const oldTypes = types;
                    types = [];
                    const oldRows = globalRows.get('${fileName}');
                    const mergedArray = [];

                    const processRows = (rawType) => {
                        const [type, state] = rawType.split('#');
                        const newRowValues = rows.filter(r => r.type === type);
                        const oldRowValues = oldRows.filter(r => r.type === type);
                        const newRowMap = new Map(newRowValues.map(obj => [obj[headers.get(type)[0] || Object.keys(obj)[0]], obj]));

                        oldRowValues.forEach(row => {
                            const key = headers.get(type)[0] || Object.keys(row)[0];
                            const keyValue = row[key];
                            const newRow = newRowMap.get(keyValue);

                            if (!newRow) {
                                // Element in arr1 not exists in arr2, mark as removed
                                mergedArray.push({ ...row, remove: true });
                            } else {
                                // Compare objects
                                const mergedObj = { [key]: keyValue };
                                const oldKeys = Object.keys(row).filter(k => k !== key);
                                const newKeys = Object.keys(newRow).filter(k => k !== key);

                                oldKeys.forEach(field => {
                                    if (!(field in newRow)) {
                                        mergedObj[field] = row[field] + '#remove';
                                    } else if (row[field] !== newRow[field]) {
                                        mergedObj[field] = row[field] + '#change#' + newRow[field];
                                    } else {
                                        mergedObj[field] = row[field];
                                    }
                                });

                                newKeys.forEach(field => {
                                    if (!(field in row)) {
                                        mergedObj[field] = newRow[field] + '#remove';
                                    }
                                });

                                mergedArray.push(mergedObj);
                                newRowMap.delete(keyValue); // Remove processed key from newRowMap
                            }
                        });
                        newRowMap.forEach(newRow => {
                            const newObj = { ...newRow, add: true };
                            mergedArray.push(newObj);
                        });
                    };

                    const processHeaders = (rawType) => {
                        const [type, state] = rawType.split('#');
                        const newHeaderValues = newHeaders.get(type) || [];
                        const oldHeaderValues = oldHeaders.get(type) || [];
                        headers.set(type, []);
                        oldHeaderValues.forEach(header => {
                            if (!newHeaderValues.includes(header)) {
                                headers.get(type).push(header + '#remove');
                            } else {
                                headers.get(type).push(header);
                                newHeaderValues.splice(newHeaderValues.findIndex(h => h === header), 1);
                            }
                        });
                        newHeaderValues.forEach(header => {
                            headers.get(type).push(header + '#add');
                        });
                    };

                    for (let i = oldTypes.length - 1; i >= 0; i--) {
                        const type = oldTypes[i];
                        if (!newTypes.includes(type)) {
                            types.push(type + '#remove');
                            processHeaders(type + '#remove');
                        } else {
                            types.push(type);
                            newTypes.splice(newTypes.findIndex(t => t === type), 1);
                            processHeaders(type);
                        }
                    }
                    for (let i = 0; i < newTypes.length; i++) {
                        types.push(newTypes[i] + '#add');
                        processHeaders(newTypes[i] + '#add')
                    }
                    types.sort();
                    adjustColumns(headers, config);

                    types.forEach(type => {
                        processRows(type);
                    });
                    globalRows.set('compare', mergedArray);

                    // Clear previous tables
                    $('.xmlTable').each(function (i, obj) {
                        const table = $(obj).DataTable();
                        table.fixedHeader.disable();
                        table.clear().destroy();
                    });
                    $('#menu-gen').empty();
                    $('#table-gen').empty();
                    // Generate new tables
                    const menu = renderMenu(types);
                    const table = renderTable(globalRows.get('compare'), types, headers, config);
                    $('#menu-gen').append(menu);
                    $('#table-gen').append(table);

                    // Datatables
                    $('.xmlTable').each(function (i, obj) {
                        const table = $(obj).DataTable({
                            colReorder: true,
                            fixedHeader: true,
                            initComplete: (settings, json) => {
                                $(obj).show('fast');
                                console.log
                            }
                        });
                        setTimeout(() => {
                            table.fixedHeader.adjust();
                        }, 1000);
                    });
                }
                function adjustColumns(headers, config) {
                    try {
                        // Default name column always first position
                        headers.forEach((value) => {
                            const nameIndex = value.findIndex(k => k === 'name');
                            if (nameIndex >= 0) {
                                value.splice(nameIndex, 1);
                                value.unshift('name');
                            }
                        });
                        // Reorder column position from config
                        config.colOrder.split(';').forEach((order) => {
                            const configOrder = order.split(':');
                            if (configOrder.length !== 2) {
                                return;
                            }
                            const adjHeaders = configOrder[1].split(',');
                            const key = Array.from(headers.keys()).filter(k => k.toLowerCase() === configOrder[0].trim().toLowerCase()).pop();
                            if (!key) {
                                return;
                            }
                            headers.get(key)?.forEach(header => {
                                if (!adjHeaders.includes(header)) {
                                    adjHeaders.push(header);
                                }
                            });
                            headers.set(key, adjHeaders);
                        });
                    } catch (e) {
                        console.error('Column order config string invalid', e);
                    }
                }
                function highlightMenu() {
                    $('*').each(function() {
                        var border = $(this).css('border');
                        if (border === '2px solid rgb(255, 165, 0)') {
                            var text = $(this).find('.block-header').text().trim().toLowerCase();
                            var targetElement = $('.' + text + '>a');
                            targetElement.css('color', 'orange');
                        }
                    });
                }
                // End helper

                window.addEventListener('message', (event) => {
                    const { command, data } = event.data;

                    if (command === 'init') {
                        headers = new Map(Object.entries(data.headers));
                        globalRows = new Map(Object.entries(data.globalRows));
                        types = data.types;
                        types.sort();
                        adjustColumns(headers, data.config);
                        const menu = renderMenu(types);
                        const table = renderTable(globalRows.get('${fileName}'), types, headers, data.config);
                        $('#menu-gen').append(menu);
                        $('#table-gen').append(table);

                        $('.xmlTable').each(function (i, obj) {
                            const table = $(obj).DataTable({
                                colReorder: true,
                                fixedHeader: true,
                                initComplete: (settings, json) => {
                                    $(obj).show('fast');
                                }
                            });
                            setTimeout(() => {
                                table.fixedHeader.adjust();
                            }, 1000);
                        });
                    } else if (command === 'compare-content') {
                        if (data) {
                            compareRows(data.rows, data.types, new Map(Object.entries(data.headers)), data.config);
                            highlightMenu();
                        }
                        $('#compare-button').prop('disabled', false);
                    }
                });

                $(document).ready(function() {
                    vscode.postMessage({
                        type: 'init'
                    });
                    $('#compare-button').click(() => {
                        $('#compare-button').prop('disabled', true);
                        if (!origin) {
                            origin = {};
                            origin.globalRows = globalRows;
                            origin.headers = headers;
                            origin.types = types;
                        } else {
                            globalRows = origin.globalRows;
                            headers = origin.headers;
                            types = origin.types;
                        }

                        vscode.postMessage({
                            type: 'compare',
                            value: {
                                fileName: '${fileName}'
                            }
                        });
                    });
                });
            </script>
        </body>
        </html>
    `;
}
