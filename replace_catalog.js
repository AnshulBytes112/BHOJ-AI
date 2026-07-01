const fs = require('fs');
const filePath = 'apps/web/src/app/(admin)/admin/catalog/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add imports for ResponsiveTable, ResponsiveDialog, ResponsiveForm
if (!content.includes('ResponsiveTable')) {
  content = content.replace(
    "import { Plus, Pencil, Power, PowerOff, Upload, X, ImageIcon, Trash2 } from 'lucide-react';",
    "import { Plus, Pencil, Power, PowerOff, Upload, X, ImageIcon, Trash2 } from 'lucide-react';\nimport { ResponsiveTable } from '@/components/common/responsive-table';\nimport { ResponsiveDialog } from '@/components/common/responsive-dialog';\nimport { ResponsiveForm } from '@/components/common/responsive-form';"
  );
}

// 2. Replace the static Table with ResponsiveTable
const tableRegex = /<Table>[\s\S]*?<\/Table>/;
const mobileCardRenderFunc = `
  const mobileCardRender = (item: Item) => (
    <div className="space-y-3">
      <div className="flex justify-between items-center border-b pb-2">
        <div className="flex items-center gap-2">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="h-10 w-10 rounded-md object-cover border" />
          ) : (
            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
              <ImageIcon size={16} className="text-muted-foreground" />
            </div>
          )}
          <div>
            <div className="font-semibold text-gray-800 text-sm">{item.name}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{item.serial_number}</div>
          </div>
        </div>
        <Badge variant={item.is_active ? 'default' : 'secondary'}>
          {item.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Category</span>
          <span className="font-medium">{item.category}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Type</span>
          <Badge className={item.is_veg ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"} variant="outline">
            {item.is_veg ? 'Veg' : 'Non-Veg'}
          </Badge>
        </div>
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Stock</span>
          <span className="font-medium">{item.stock_quantity} ({item.stock_type})</span>
        </div>
        <div>
          <span className="text-gray-400 block text-[9px] uppercase tracking-wider">Price</span>
          <span className="font-bold text-blue-600">Rs {Number(item.selling_price).toFixed(2)}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t pt-2 mt-2">
        <Button type="button" variant="outline" size="sm" className="gap-1 h-8" onClick={() => openEditModal(item)}>
          <Pencil size={14} /> Edit
        </Button>
        {item.is_active ? (
          <Button type="button" variant="outline" size="sm" className="gap-1 h-8" onClick={() => requestDeactivate(item)}>
            <PowerOff size={14} /> Disable
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="gap-1 h-8" onClick={() => handleActivate(item)}>
            <Power size={14} /> Enable
          </Button>
        )}
        <Button type="button" variant="destructive" size="sm" className="gap-1 h-8" onClick={() => requestDelete(item)}>
          <Trash2 size={14} /> Delete
        </Button>
      </div>
    </div>
  );
`;

// Insert the render function right before the return statement of AdminCatalogPage
content = content.replace(
  /(\s+)(return\s*\(\s*<RoleGuard)/,
  '$1' + mobileCardRenderFunc + '$1$2'
);

const newTable = `<ResponsiveTable
                data={filteredItems}
                loading={isLoading}
                rowKey={(item) => item.id}
                mobileCardRender={mobileCardRender}
                columns={[
                  {
                    header: 'Image',
                    accessor: (item) => item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="h-10 w-10 rounded-md object-cover border" />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                        <ImageIcon size={16} className="text-muted-foreground" />
                      </div>
                    )
                  },
                  { header: 'Serial No', accessor: (item) => <span className="font-mono text-xs text-muted-foreground">{item.serial_number}</span> },
                  { header: 'Name', accessor: (item) => <span className="font-medium">{item.name}</span> },
                  { header: 'Category', accessor: (item) => item.category },
                  {
                    header: 'Type',
                    accessor: (item) => (
                      <Badge 
                        className={item.is_veg ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}
                        variant="outline"
                      >
                        {item.is_veg ? 'Veg' : 'Non-Veg'}
                      </Badge>
                    )
                  },
                  { header: 'Price', accessor: (item) => \`Rs \${Number(item.selling_price).toFixed(2)}\`, className: 'text-right' },
                  { header: 'Stock Qty', accessor: (item) => item.stock_quantity, className: 'text-right' },
                  { header: 'Stock Type', accessor: (item) => <span className="capitalize">{item.stock_type}</span> },
                  {
                    header: 'Status',
                    accessor: (item) => (
                      <Badge variant={item.is_active ? 'default' : 'secondary'}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    )
                  },
                  {
                    header: 'Actions',
                    accessor: (item) => (
                      <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => openEditModal(item)}>
                          <Pencil size={14} /> Edit
                        </Button>
                        {item.is_active ? (
                          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => requestDeactivate(item)}>
                            <PowerOff size={14} /> Deactivate
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => handleActivate(item)}>
                            <Power size={14} /> Activate
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => requestDelete(item)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ),
                    className: 'text-right'
                  }
                ]}
                emptyMessage="No items found."
              />`;

content = content.replace(tableRegex, newTable);

// 3. Replace all 4 Dialogs with ResponsiveDialogs
// Dialog 1: Item Form (with ResponsiveForm)
const itemFormDialogRegex = /<Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>[\s\S]*?<\/Dialog>/;
const newItemFormDialog = `<ResponsiveDialog
          isOpen={isFormOpen}
          onOpenChange={setIsFormOpen}
          title={editingItem ? 'Edit Item' : 'Create New Item'}
          description={editingItem ? 'Update the details of the catalog item.' : 'Add a new item to your POS catalog.'}
          className="max-w-xl"
        >
          <ResponsiveForm 
            className="space-y-4"
            actions={
              <>
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveItem} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Item'}
                </Button>
              </>
            }
          >
            {/* Image Upload Area */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Item Image (Optional)</label>
              <div 
                className={\`border-2 border-dashed rounded-xl p-4 transition-colors text-center \${isDragging ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/50'}\`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleImageFile(file);
                }}
              >
                {imagePreview ? (
                  <div className="relative inline-block">
                    <img src={imagePreview} alt="Preview" className="h-32 w-32 object-cover rounded-lg border shadow-sm" />
                    <button type="button" onClick={removeImage} className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 shadow-sm hover:scale-110 transition-transform">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Upload className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Click to upload or drag and drop</p>
                      <p className="text-xs text-muted-foreground mt-1">SVG, PNG, JPG or GIF (max 5MB)</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => fileInputRef.current?.click()} disabled={isUploadingImage}>
                      {isUploadingImage ? 'Processing...' : 'Select File'}
                    </Button>
                  </div>
                )}
                <input type="file" ref={fileInputRef} className="hidden" accept="image/png, image/jpeg, image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageFile(file); }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium text-foreground">Name *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Masala Dosa" />
                {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
              </div>

              <div className="col-span-1 space-y-1">
                <label className="text-sm font-medium text-foreground">Category *</label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="" disabled>Select category</option>
                  {categoryNames.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
                {formErrors.category && <p className="text-xs text-destructive">{formErrors.category}</p>}
              </div>

              <div className="col-span-1 space-y-1">
                <label className="text-sm font-medium text-foreground">Selling Price *</label>
                <Input type="number" step="0.01" min="0" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} placeholder="0.00" />
                {formErrors.selling_price && <p className="text-xs text-destructive">{formErrors.selling_price}</p>}
              </div>

              <div className="col-span-1 space-y-1">
                <label className="text-sm font-medium text-foreground">Stock Type</label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.stock_type} onChange={(e) => setForm({ ...form, stock_type: e.target.value as StockType })}>
                  <option value="limited">Limited</option>
                  <option value="unlimited">Unlimited</option>
                </select>
              </div>

              <div className="col-span-1 space-y-1">
                <label className="text-sm font-medium text-foreground">Quantity {form.stock_type === 'unlimited' ? '(Ignored)' : '*'}</label>
                <Input type="number" step="1" min="0" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} disabled={form.stock_type === 'unlimited'} placeholder="0" />
                {formErrors.stock_quantity && <p className="text-xs text-destructive">{formErrors.stock_quantity}</p>}
              </div>

              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium text-foreground">Dietary Type *</label>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="is_veg" checked={form.is_veg === true} onChange={() => setForm({ ...form, is_veg: true })} /> Veg
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="is_veg" checked={form.is_veg === false} onChange={() => setForm({ ...form, is_veg: false })} /> Non-Veg
                  </label>
                </div>
                {formErrors.is_veg && <p className="text-xs text-destructive mt-1">{formErrors.is_veg}</p>}
              </div>

              {editingItem && (
                <div className="col-span-2 flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-foreground">Active Status</label>
                    <p className="text-xs text-muted-foreground">Toggle if this item is currently available.</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" className="peer sr-only" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary peer-checked:after:translate-x-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all"></div>
                  </label>
                </div>
              )}
            </div>
          </ResponsiveForm>
        </ResponsiveDialog>`;
content = content.replace(itemFormDialogRegex, newItemFormDialog);


// Dialog 2: Deactivate Confirmation
const deactivateDialogRegex = /<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>[\s\S]*?<\/Dialog>/;
const newDeactivateDialog = `<ResponsiveDialog
          isOpen={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Deactivate Item"
          description={pendingDeactivateItem ? \`Are you sure you want to deactivate "\${pendingDeactivateItem.name}"? It will be hidden from new POS bills.\` : ""}
          footer={
            <div className="flex gap-2 justify-end w-full">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button onClick={handleDeactivateConfirmed}>Deactivate</Button>
            </div>
          }
        />`;
content = content.replace(deactivateDialogRegex, newDeactivateDialog);


// Dialog 3: Add Category
const addCategoryDialogRegex = /<Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>[\s\S]*?<\/Dialog>/;
const newAddCategoryDialog = `<ResponsiveDialog
          isOpen={isCategoryDialogOpen}
          onOpenChange={setIsCategoryDialogOpen}
          title="Create New Category"
          description="Categories are used to group catalog items (e.g., Starters, Main Course)."
        >
          <ResponsiveForm 
            onSubmit={(e) => { e.preventDefault(); handleCreateCategory(); }}
            actions={
              <>
                <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)} disabled={isCategorySaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCategorySaving || !newCategoryName.trim()}>
                  {isCategorySaving ? 'Creating...' : 'Create Category'}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Category Name *</label>
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Beverages"
                  autoFocus
                />
              </div>
            </div>
          </ResponsiveForm>
        </ResponsiveDialog>`;
content = content.replace(addCategoryDialogRegex, newAddCategoryDialog);


// Dialog 4: Delete Confirmation
const deleteDialogRegex = /<Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>[\s\S]*?<\/Dialog>/;
const newDeleteDialog = `<ResponsiveDialog
          isOpen={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          title="Delete Item"
          description={pendingDeleteItem ? \`Are you sure you want to permanently delete "\${pendingDeleteItem.name}"? This cannot be undone.\` : ""}
          footer={
            <div className="flex gap-2 justify-end w-full">
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteConfirmed} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          }
        />`;
content = content.replace(deleteDialogRegex, newDeleteDialog);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Catalog page refactored!');
