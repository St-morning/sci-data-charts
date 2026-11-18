import {openDB,type IDBPDatabase} from "idb";
export interface SaveResult {ok:boolean;message?:string}
const keys=["scibench.storyboard.v1","scibench.findings.v1","scibench.panels.v1"];
const cache=new Map<string,unknown>();
let database:IDBPDatabase|undefined,initialization:Promise<void>|undefined;
let queue:Promise<unknown>=Promise.resolve();
let warning="";
export function storageWarning():string{return warning;}
function legacy(key:string):unknown {try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):undefined;}catch{return undefined;}}
export function readWorkspace<T>(key:string,fallback:T):T {
  if(cache.has(key))return cache.get(key) as T;
  const value=legacy(key);if(value!==undefined){cache.set(key,value);return value as T;}return fallback;
}
export function initializeWorkspace():Promise<void> {
  return initialization??=(async()=>{
    try {
      database=await openDB("scibench.workspace",1,{upgrade(db){db.createObjectStore("values");},blocked(){warning="工作区数据库被其他旧页面占用，请关闭旧页面后刷新。";}});
      const tx=database.transaction("values","readwrite");
      for(const key of keys){const value=await tx.store.get(key);if(value!==undefined)cache.set(key,value);else {const old=legacy(key);if(old!==undefined){cache.set(key,old);await tx.store.put(old,key);}}}
      await tx.done;
      // Keep legacy data intact as a migration backup. New writes use IndexedDB only.
    } catch {
      database?.close();database=undefined;
      for(const key of keys){const old=legacy(key);if(old!==undefined)cache.set(key,old);}
      warning="持久存储不可用，当前改动仅保留在本次会话；请及时导出文件。";
    }
  })();
}
export function writeWorkspace(key:string,value:unknown):Promise<SaveResult> {
  cache.set(key,value); // Real session fallback, including quota and permission failures.
  const operation=queue.then(async()=>{
    await initializeWorkspace();
    if(!database)return {ok:false,message:warning||"无法持久保存，数据仅暂存在当前会话。"};
    try{await database.put("values",value,key);if(typeof window!=="undefined")window.dispatchEvent(new Event("scibench:workspacechange"));return {ok:true};}
    catch{return {ok:false,message:"保存失败（浏览器存储空间不足或权限受限），内容仅暂存在当前会话，请导出备份。"};}
  });
  queue=operation.catch(()=>undefined);return operation;
}
