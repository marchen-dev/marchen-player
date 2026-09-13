import fs from 'node:fs/promises'
// 先启动 Web dev server；可传入真实 XML 路径作为额外样本。
import { chromium } from 'playwright-core'
async function main() {
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
 const page=await browser.newPage()
 await page.goto(process.env.DANMAKU_TEST_URL ?? 'http://127.0.0.1:1116')
 const sample=process.argv[2] ? await fs.readFile(process.argv[2], 'utf8') : null
 const result=await page.evaluate(async(sample)=>{
  const {parseLocalDanmaku:parse,readLocalDanmaku:read,localDanmakuIdentity:identity,MAX_DANMAKU_FILE_SIZE:max}=await import('/src/lib/local-danmaku.ts')
  const checks=[]; const check=(value,label)=>{if(!value)throw new Error(label);checks.push(label)}
  const xml='<i><d p="1.25,5,25,0,123,0,0,0">中文 &amp; 黑色</d></i>'
  const parsed=parse(xml,'xml');check(parsed[0].p==='1.25,5,#000000,123'&&parsed[0].m==='中文 & 黑色','XML 时间、位置、黑色、实体')
  const json=JSON.stringify([{progress:1234,mode:4,color:16777215,content:'底部',ctime:456}]);check(parse(json,'json')[0].p==='1.234,4,#FFFFFF,456','JSON 时间与属性')
  for(const [text,ext] of [['<i>','xml'],['<wrong/>','xml'],['<i/>','xml'],['[]','json'],['{}','json'],['{','json'],['<i><d p="NaN,1,25,1,1">坏</d></i>','xml'],['[{"mode":1,"color":-1,"content":"坏"}]','json']]){
   let rejected=false;try{parse(text,ext)}catch{rejected=true}check(rejected,`拒绝无效输入 ${text}`)
  }
  const a=await read(new File([xml],'甲.XML'));const b=await read(new File([xml],'乙.xml'));const c=await read(new File([xml.replace('中文','其他')],'甲.XML'))
  check(identity(a.source)===identity(b.source),'同内容改名可去重');check(identity(a.source)!==identity(c.source),'同名不同内容可区分')
  for(const f of [new File([xml],'bad.txt'),new File([new Uint8Array(max+1)],'huge.xml')]){let rejected=false;try{await read(f)}catch{rejected=true}check(rejected,`拒绝 ${f.name}`)}
  check(parse('<i><d p="0,1,25,4294930235,0">ARGB</d></i>', 'xml')[0].p === '0,1,#FF6F3B,0', 'ARGB 转 RGB')
  const start=performance.now();const real=sample ? await read(new File([sample], 'sample.xml')) : null
  if(real) check(real.content.count > 0, '真实 XML 样本')
  return {checks,sampleMs:Math.round(performance.now()-start),count:real?.content.count}
 },sample)
 process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

} finally {await browser.close()}

}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
