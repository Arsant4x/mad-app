# ① خطةُ التنفيذ — 43 مساراً (search fields declared per entity)

## A. findMany مباشر ⟵ pagedFindMany
accounts: code,name · attendance: notes · audit-log: summary,actorName,entity (keep limit when no page) · banks: name,iban · branches: name,type ·
cash-drawers: name · company-users: name · currencies: code,name,symbol · currencies/rates: fromCode,toCode · customers: name,phone,vatNumber ·
employees: fullName,jobTitle,department,phone · fiscal-years: name · integrations: provider,label · inventory/write-offs: no,note,reasonCode ·
leaves/requests: reason,requestedByName,decidedByName · leaves/types: name · maintenance: title,description,reportedBy,assignedTo ·
payments: no,reference,notes · products: name,sku,barcode,category · properties: name,address,deedNo · quotes: no,notes ·
reservations: name,phone · scripts: title,text · supplier-payments: no,reference,notes · suppliers: name,phone,vatNumber,category ·
support-access/log: actorName,path,method · templates: name · warehouses: name,location,manager · warranties: subject,provider,reference ·
warranties/cover: subject,provider · admin/processing-agreement: name,purpose,location · support-access/admin: companyName,requestedByName,reason ·
admin/deletion-requests: companyName,reason (window then preview) · obligations: title,body (ensure defaults first)

## B. محسوبة ⟵ pageArray (search by function)
activities: name · companies: orgName,legalName,vatNumber,email · inventory/provisional: productName,warehouseName ·
inventory/stock-levels: product.name,product.sku,warehouse.name · invoices: no,customer.name (db: OR with relation) ·
pos/shifts: openedByName,notes · support-access: requestedByName,reason · tasks/mine: title,note · units: unitNo,type,subtype,floor
