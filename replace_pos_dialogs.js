const fs = require('fs');
const filePath = 'apps/web/src/app/(admin)/admin/pos/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// isReopenDialogOpen
content = content.replace(
  /<Dialog open={isReopenDialogOpen} onOpenChange={setIsReopenDialogOpen}>\s*<DialogContent className=\"sm:max-w-\[420px\]\">\s*<DialogHeader>\s*<DialogTitle>Reopen Session\?<\/DialogTitle>\s*<DialogDescription>\s*([\s\S]*?)<\/DialogDescription>\s*<\/DialogHeader>\s*<DialogFooter>\s*([\s\S]*?)<\/DialogFooter>\s*<\/DialogContent>\s*<\/Dialog>/g,
  '<ResponsiveDialog isOpen={isReopenDialogOpen} onOpenChange={setIsReopenDialogOpen} title="Reopen Session?" description={`$1`} footer={<>$2</>}></ResponsiveDialog>'
);

// isFreeTableDialogOpen
content = content.replace(
  /<Dialog open={isFreeTableDialogOpen} onOpenChange={setIsFreeTableDialogOpen}>\s*<DialogContent className=\"sm:max-w-\[420px\]\">\s*<DialogHeader>\s*<DialogTitle>Free Table\?<\/DialogTitle>\s*<DialogDescription>\s*([\s\S]*?)<\/DialogDescription>\s*<\/DialogHeader>\s*<DialogFooter>\s*([\s\S]*?)<\/DialogFooter>\s*<\/DialogContent>\s*<\/Dialog>/g,
  '<ResponsiveDialog isOpen={isFreeTableDialogOpen} onOpenChange={setIsFreeTableDialogOpen} title="Free Table?" description={`$1`} footer={<>$2</>}></ResponsiveDialog>'
);

// isAddTableDialogOpen
content = content.replace(
  /<Dialog open={isAddTableDialogOpen} onOpenChange={setIsAddTableDialogOpen}>\s*<DialogContent className=\"sm:max-w-\[425px\]\">\s*<DialogHeader>\s*<DialogTitle>Add New Table<\/DialogTitle>\s*<DialogDescription>\s*([\s\S]*?)<\/DialogDescription>\s*<\/DialogHeader>\s*<div className=\"grid gap-4 py-4\">\s*([\s\S]*?)<\/div>\s*<DialogFooter>\s*([\s\S]*?)<\/DialogFooter>\s*<\/DialogContent>\s*<\/Dialog>/g,
  '<ResponsiveDialog isOpen={isAddTableDialogOpen} onOpenChange={setIsAddTableDialogOpen} title="Add New Table" description={`$1`} footer={<>$3</>}><div className="grid gap-4 py-4">$2</div></ResponsiveDialog>'
);

// isFormOpen
content = content.replace(
  /<Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>\s*<DialogContent className=\"sm:max-w-\[500px\]\">\s*<DialogHeader>\s*<DialogTitle>Add Custom Item<\/DialogTitle>\s*<\/DialogHeader>\s*([\s\S]*?)<DialogFooter>\s*([\s\S]*?)<\/DialogFooter>\s*<\/DialogContent>\s*<\/Dialog>/g,
  '<ResponsiveDialog isOpen={isFormOpen} onOpenChange={setIsFormOpen} title="Add Custom Item" footer={<>$2</>}>$1</ResponsiveDialog>'
);

// showWipDialog
content = content.replace(
  /<Dialog open={showWipDialog} onOpenChange={setShowWipDialog}>\s*<DialogContent className=\"sm:max-w-\[400px\]\">\s*<DialogHeader>\s*<DialogTitle>Under Development<\/DialogTitle>\s*<\/DialogHeader>\s*<div className=\"py-6 text-center text-gray-500\">\s*([\s\S]*?)<\/div>\s*<DialogFooter>\s*([\s\S]*?)<\/DialogFooter>\s*<\/DialogContent>\s*<\/Dialog>/g,
  '<ResponsiveDialog isOpen={showWipDialog} onOpenChange={setShowWipDialog} title="Under Development" footer={<>$2</>}><div className="py-6 text-center text-gray-500">$1</div></ResponsiveDialog>'
);

// isPreviewOpen
content = content.replace(
  /<Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>\s*<DialogContent className=\"max-w-md\">\s*<DialogHeader>\s*<DialogTitle>Bill Preview & Confirmation<\/DialogTitle>\s*<DialogDescription>\s*([\s\S]*?)<\/DialogDescription>\s*<\/DialogHeader>\s*([\s\S]*?)<DialogFooter className=\"gap-2 sm:gap-0\">\s*([\s\S]*?)<\/DialogFooter>\s*<\/DialogContent>\s*<\/Dialog>/g,
  '<ResponsiveDialog isOpen={isPreviewOpen} onOpenChange={setIsPreviewOpen} title="Bill Preview & Confirmation" description={`$1`} footer={<div className="flex gap-2 sm:gap-0 justify-end w-full">$3</div>}>$2</ResponsiveDialog>'
);

// configuringItem
content = content.replace(
  /<Dialog open={configuringItem !== null} onOpenChange={\(open\) => { if \(!open\) setConfiguringItem\(null\); }}>\s*<DialogContent className=\"sm:max-w-\[450px\]\">\s*<DialogHeader>\s*<DialogTitle>Configure {configuringItem\?.name}<\/DialogTitle>\s*<DialogDescription>\s*([\s\S]*?)<\/DialogDescription>\s*<\/DialogHeader>\s*([\s\S]*?)<DialogFooter className=\"mt-2 pt-4 border-t\">\s*([\s\S]*?)<\/DialogFooter>\s*<\/DialogContent>\s*<\/Dialog>/g,
  '<ResponsiveDialog isOpen={configuringItem !== null} onOpenChange={(open) => { if (!open) setConfiguringItem(null); }} title={`Configure ${configuringItem?.name}`} description={`$1`} footer={<>$3</>}>$2</ResponsiveDialog>'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Dialogs updated successfully');
