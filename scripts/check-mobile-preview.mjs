import {createServer} from "node:http";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
const directory=path.resolve("apps/mobile/dist"),output=path.resolve("output/mobile-qa");
const server=createServer(async(request,response)=>{
  try {
    const pathname=decodeURIComponent(new URL(request.url,"http://localhost").pathname);
    const target=path.resolve(directory,`.${pathname==="/"?"/index.html":pathname}`);
    if(!target.startsWith(directory+path.sep))throw new Error("Outside export");
    const body=await readFile(target);
    response.writeHead(200,{"Content-Type":({".html":"text/html",".js":"application/javascript",".ttf":"font/ttf",".png":"image/png"})[path.extname(target)]||"application/octet-stream"});response.end(body);
  }catch {response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(8082,"127.0.0.1",resolve));
await mkdir(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
const report=[];
try {
  const page=await browser.newPage();const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  for(const [name,width,height] of [["phone",390,844],["ipad",820,1180],["wide",1440,1000]]) {
    await page.setViewport({width,height});
    await page.goto("http://127.0.0.1:8082",{waitUntil:"networkidle2"});
    await page.waitForSelector('[aria-label="Email"]',{timeout:30000});
    await page.evaluate(()=>document.fonts.ready);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    if(overflow||errors.length)throw new Error(`Native web preview error ${name}: ${errors.join(",")}`);
    await page.screenshot({path:path.join(output,`native-signin-${name}.png`),fullPage:true});
    report.push({viewport:name,overflow,errors:[...errors],surface:"React Native web rendering; not a device screenshot"});
  }
  await page.locator('[aria-label="Email"]').fill("interface-fixture@example.invalid");
  await page.locator('[aria-label="Password"]').fill("not-a-real-password");
  await page.locator('::-p-text(Enter your studio)').click();
  await page.waitForFunction(()=>document.body.textContent.includes("Android/iOS development build"));
  report.push({check:"browser preview cannot store a native private session",passed:true});
}finally{await writeFile(path.join(output,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();server.close();}
