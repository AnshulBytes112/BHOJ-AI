const fs = require('fs');
let content = fs.readFileSync('apps/web/src/app/(admin)/admin/pricing/page.tsx', 'utf8');

const newTabContent2 = `          {/* Tab Content 2: Zone Overrides & Table Mapping */}
          {activeTab === 'zone-overrides' && (
            <div className="space-y-6">
              {/* Shared Header for Active Zone */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border shadow-sm">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Zone Management</h2>
                  <p className="text-xs text-muted-foreground">Select a zone to manage its tables and pricing rules.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">Active Zone:</span>
                    <select
                      className="h-9 rounded-lg border border-input bg-white px-3 text-sm font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500"
                      value={selectedZoneId}
                      onChange={(e) => setSelectedZoneId(e.target.value)}
                    >
                      {zones.length === 0 && <option value="">No Zones Available</option>}
                      {zones.map((z) => (
                        <option key={z.zone_id} value={z.zone_id}>{z.name}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    onClick={handleSaveZonePrices}
                    disabled={isItemsSaving || !selectedZoneId}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-2 shadow-sm font-semibold shrink-0"
                  >
                    <Save size={16} /> Save Overrides
                  </Button>
                </div>
              </div>

              {selectedZoneId ? (() => {
                const assignedTables = tables.filter(t => t.zone_id === selectedZoneId);
                const unassignedTables = tables.filter(t => t.zone_id === null);
                const activeZoneName = zones.find(z => z.zone_id === selectedZoneId)?.name || '';

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Tables assignment */}
                    <Card className="border bg-white shadow-sm rounded-2xl">
                      <CardHeader className="border-b pb-4">
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                          Table Assignments
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-6">
                        {/* Assigned Tables Box */}
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            Tables in {activeZoneName}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {assignedTables.length === 0 ? (
                               <p className="text-xs text-muted-foreground italic">No tables assigned to this zone.</p>
                            ) : (
                               assignedTables.map(tbl => (
                                 <Badge 
                                   key={tbl.table_id} 
                                   variant="default"
                                   className="cursor-pointer gap-1 pr-2 py-1.5 bg-indigo-600 hover:bg-red-500 text-white transition-colors text-xs font-semibold"
                                   onClick={() => handleAssignTableZone(tbl.table_id, null)}
                                   title="Click to remove"
                                 >
                                   Table {tbl.table_number}
                                   <X size={14} className="ml-1 opacity-70" />
                                 </Badge>
                               ))
                            )}
                          </div>
                        </div>

                        {/* Unassigned Tables Box */}
                        <div className="pt-4 border-t">
                          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                            Unassigned Tables
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {unassignedTables.length === 0 ? (
                               <p className="text-xs text-muted-foreground italic">All tables are currently assigned.</p>
                            ) : (
                               unassignedTables.map(tbl => (
                                 <Badge 
                                   key={tbl.table_id} 
                                   variant="outline"
                                   className="cursor-pointer hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-colors border-dashed py-1.5 text-xs font-medium text-gray-600"
                                   onClick={() => handleAssignTableZone(tbl.table_id, selectedZoneId)}
                                   title="Click to assign"
                                 >
                                   <Plus size={14} className="mr-1 opacity-50" />
                                   Table {tbl.table_number}
                                 </Badge>
                               ))
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Right Column: Pricing Overrides */}
                    <div className="lg:col-span-2 space-y-4">
                      <Card className="border bg-white shadow-sm rounded-2xl overflow-hidden">
                        <CardHeader className="border-b bg-gray-50/50 pb-4">
                          <CardTitle className="text-lg font-bold flex items-center gap-2">
                            Pricing Rules
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader className="bg-gray-50/75">
                              <TableRow>
                                <TableHead className="font-bold text-gray-700">Item Name</TableHead>
                                <TableHead className="font-bold text-gray-700">Category</TableHead>
                                <TableHead className="font-bold text-gray-700">Base Price (Rs)</TableHead>
                                <TableHead className="font-bold text-gray-700 w-36">Zone Price (Rs)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {zoneItems.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                    Select a zone to view items.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                zoneItems.map((item) => (
                                  <TableRow key={item.item_id}>
                                    <TableCell className="font-bold text-gray-800">{item.item_name}</TableCell>
                                    <TableCell className="text-gray-500 text-xs font-semibold">{item.category}</TableCell>
                                    <TableCell className="font-semibold text-gray-600">{Number(item.base_price).toFixed(2)}</TableCell>
                                    <TableCell>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="Use Base"
                                        className="h-8 rounded-lg text-xs font-bold text-gray-800"
                                        value={editedZonePrices[item.item_id] ?? ''}
                                        onChange={(e) =>
                                          setEditedZonePrices({
                                            ...editedZonePrices,
                                            [item.item_id]: e.target.value,
                                          })
                                        }
                                      />
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                );
              })() : (
                <div className="text-center py-12 bg-white rounded-2xl border shadow-sm">
                  <p className="text-gray-500 font-medium">Please create or select a zone to manage tables and prices.</p>
                </div>
              )}
            </div>
          )}`;

const startIdx = content.indexOf('{/* Tab Content 2: Zone Overrides & Table Mapping */}');
const endIdx = content.indexOf('{/* Tab Content 3: Schedules */}');
if (startIdx !== -1 && endIdx !== -1) {
  content = content.substring(0, startIdx) + newTabContent2 + '\n\n          ' + content.substring(endIdx);
  fs.writeFileSync('apps/web/src/app/(admin)/admin/pricing/page.tsx', content, 'utf8');
  console.log('Successfully replaced Tab Content 2.');
} else {
  console.log('Could not find markers.');
}
