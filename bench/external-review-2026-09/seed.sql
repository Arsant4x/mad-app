-- usage: psql -v n=10000 -v cid=c10k -f seed.sql
\set n :n
\set cid :cid
BEGIN;
SET session_replication_role = replica; -- disable triggers for bulk seed
INSERT INTO permission_templates(id,name,"isSystem","isAllScreens","allowedScreens","updatedAt") VALUES (:'cid'||'-tpl','t',false,true,'{}',now()) ON CONFLICT DO NOTHING;
INSERT INTO login_identities(id,username,"passwordHash","actorType","updatedAt","companyId") VALUES (:'cid'||'-li',:'cid'||'-user','x','COMPANY',now(),:'cid');
INSERT INTO companies(id,"loginIdentityId","orgName","permissionTemplateId","updatedAt",status) VALUES (:'cid',:'cid'||'-li','seed '||:'cid',:'cid'||'-tpl',now(),'ACTIVE');
INSERT INTO branches(id,"companyId",name,"updatedAt") SELECT :'cid'||'-b'||g,:'cid','branch '||g,now() FROM generate_series(1,3) g;
INSERT INTO warehouses(id,"companyId",name,"updatedAt") SELECT :'cid'||'-w'||g,:'cid','wh '||g,now() FROM generate_series(1,3) g;
INSERT INTO accounts(id,"companyId",code,name,type,"updatedAt") SELECT :'cid'||'-a'||g,:'cid',(1000+g*10)::text,'acc '||g,(ARRAY['asset','liability','revenue','expense'])[1+g%4],now() FROM generate_series(1,60) g;
INSERT INTO customers(id,"companyId",name,"updatedAt") SELECT :'cid'||'-c'||g,:'cid','cust '||g,now() FROM generate_series(1,500) g;
INSERT INTO products(id,"companyId",name,price,cost,"updatedAt") SELECT :'cid'||'-p'||g,:'cid','prod '||g,10+g,5+g,now() FROM generate_series(1,300) g;
INSERT INTO journal_entries(id,"companyId",no,date,memo,"totalDebit","totalCredit","baseTotalDebit","baseTotalCredit",auto,"branchId")
 SELECT :'cid'||'-je'||g,:'cid','JE-'||g,date '2024-01-01'+ (g % 900),'inv '||g,115,115,115,115,true,:'cid'||'-b'||(1+g%3) FROM generate_series(1,:n) g;
INSERT INTO journal_lines(id,"companyId","journalEntryId","accountId",debit,credit,"branchId","customerId")
 SELECT :'cid'||'-jl'||g||'-'||k,:'cid',:'cid'||'-je'||g,:'cid'||'-a'||(1+(g*3+k)%60),CASE WHEN k=1 THEN 115 ELSE 0 END,CASE WHEN k=1 THEN 0 ELSE 57.5 END,:'cid'||'-b'||(1+g%3),:'cid'||'-c'||(1+g%500)
 FROM generate_series(1,:n) g, generate_series(1,3) k;
INSERT INTO invoices(id,"companyId",no,"customerId","issueDate","dueDate",status,subtotal,"taxTotal",total,"baseSubtotal","baseTaxTotal","baseTotal","journalEntryId","branchId","updatedAt")
 SELECT :'cid'||'-i'||g,:'cid','INV-'||g,:'cid'||'-c'||(1+g%500),date '2024-01-01'+(g%900),date '2024-01-31'+(g%900),(ARRAY['DUE','PAID','PARTIAL'])[1+g%3]::"InvoiceStatus",100,15,115,100,15,115,:'cid'||'-je'||g,:'cid'||'-b'||(1+g%3),now() FROM generate_series(1,:n) g;
INSERT INTO invoice_lines(id,"companyId","invoiceId",description,quantity,"unitPrice","taxRate","productId")
 SELECT :'cid'||'-il'||g||'-'||k,:'cid',:'cid'||'-i'||g,'line',1,33.33,15,:'cid'||'-p'||(1+(g+k)%300) FROM generate_series(1,:n) g, generate_series(1,3) k;
INSERT INTO stock_movements(id,"companyId","productId","warehouseId",type,qty,date,origin,"branchId")
 SELECT :'cid'||'-sm'||g||'-'||k,:'cid',:'cid'||'-p'||(1+(g+k)%300),:'cid'||'-w'||(1+g%3),(CASE WHEN g%4=0 THEN 'IN' ELSE 'OUT' END)::"StockMovementType",CASE WHEN g%4=0 THEN 40 ELSE 1 END,date '2024-01-01'+(g%900),'MANUAL'::"MovementOrigin",:'cid'||'-b'||(1+g%3)
 FROM generate_series(1,:n) g, generate_series(1,3) k;
INSERT INTO payments(id,"companyId",no,"customerId",date,amount,method,"baseAmount","branchId")
 SELECT :'cid'||'-pay'||g,:'cid','PAY-'||g,:'cid'||'-c'||(1+g%500),date '2024-01-01'+(g%900),115,'CASH','115',:'cid'||'-b'||(1+g%3) FROM generate_series(1,:n) g WHERE g%2=0;
INSERT INTO payment_allocations(id,"companyId","paymentId","invoiceId",amount)
 SELECT :'cid'||'-pa'||g,:'cid',:'cid'||'-pay'||g,:'cid'||'-i'||g,115 FROM generate_series(1,:n) g WHERE g%2=0;
COMMIT;
ANALYZE;
