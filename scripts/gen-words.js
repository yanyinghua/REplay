#!/usr/bin/env node
/* scripts/gen-words.js —— 5000 词库自动生成器
 * 词表：优先下载 google-10000 高频词表（前 5200），失败则用内置兜底词表
 * 释义/音标/例句：调用有道词典免费接口逐个抓取（并发 + 断点续传）
 *
 * 用法：
 *   node scripts/gen-words.js                    # 全量生成
 *   node scripts/gen-words.js --limit 20         # 只抓前 20 个新词（测试用）
 *   node scripts/gen-words.js --from 1000 --to 2000   # 分段重跑
 *   node scripts/gen-words.js --vocab-file my.txt      # 自定义词表（每行一个词）
 *
 * 产物：覆盖 miniprogram/data/words.js（保留原有 260 个人工词条）
 */
const https = require('https')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const WORDS_FILE = path.join(ROOT, 'miniprogram', 'data', 'words.js')
const CACHE_DIR = path.join(__dirname, 'cache')
const CACHE_FILE = path.join(CACHE_DIR, 'dict.json')

const argv = process.argv.slice(2)
const arg = (name, dft) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dft }
const LIMIT = parseInt(arg('limit', '0'), 10) || 0
const FROM = parseInt(arg('from', '0'), 10) || 0
const TO = parseInt(arg('to', '0'), 10) || 0
const VOCAB_FILE = arg('vocab-file', '')

const TARGET_COUNT = 5000       // 新增词目标数量
const HALF = 2500               // core1 / core2 分界
const CONC = 8                  // 并发数
const GAP = 150                 // 每批间隔 ms（限速）

// 过滤最基础的语法虚词（无学习价值），避免占词位
const STOP = new Set(('the,of,and,a,an,to,in,is,are,was,were,be,been,being,do,does,did,have,has,had,i,you,he,she,it,we,they,me,him,her,us,them,my,your,his,its,our,their,mine,yours,hers,ours,theirs,this,that,these,those,am,isnt,dont,doesnt,wont,wouldnt,cant,couldnt,shouldnt,im,youre,hes,shes,its,were,theyre,not,no,yes,at,on,for,with,as,from,by,of,or,but,so,if,then,than,too,very,just,also,such,etc').split(','))
const GOOGLE_URL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa.txt'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/* ---------- 内置兜底词表（网络下载失败时才用，1000 核心高频词） ---------- */
const FALLBACK_RAW = [
  'the,of,and,to,in,a,is,that,for,it,on,as,with,was,be,at,by,an,this,are,not,but,from,or,have,his,they,you,he,she,we,which,one,all,their,what,so,up,out,if,about,who,get,which,go,me,when,make,can,like,time,no,just,him,know,take,people,into,year,your,good,some,could,them,see,other,than,then,now,look,only,come,its,over,think,also,back,after,use,two,how,our,work,first,well,way,even,new,want,because,any,these,give,day,most,us,very,here,thing,man,world,long,too,this',
  'own,much,right,life,where,big,down,might,find,between,never,such,would,should,still,great,old,ask,help,turn,three,night,small,own,place,home,show,why,put,away,again,here,water,house,say,same,part,men,thing,out,hand,make,point,mean,state,woman,child,young,work,ever,course,day,own,area,group,head,side,kind,four,problem,company,feel,under,last,start,good,left,may,right,use,mean,time,other,world,system,set,city,came,each,must,line,need,long,home,bring,give,stay,here,both,good,hand,back,have,look,most,big,also,many,way,own,over,so,some,thing,should,could,them,know',
  'want,look,come,make,go,find,give,tell,work,call,try,ask,need,feel,become,leave,put,mean,keep,let,begin,seem,help,talk,turn,start,show,hear,play,run,move,like,believe,hold,bring,happen,must,write,provide,sit,stand,lose,pay,meet,include,continue,set,learn,change,lead,understand,watch,follow,stop,speak,read,allow,add,spend,grow,open,walk,win,offer,remember,love,consider,appear,buy,wait,serve,die,send,expect,build,stay,fall,cut,reach,kill,remain,suggest,raise,pass,sell,require,report,decide,pull,carry,break,thank,develop,among,dead,country,money,much,family,education,home,health,government,power,war,book,class,child,country',
  'father,mother,school,student,teacher,food,water,air,earth,fire,sun,moon,star,sea,land,road,house,room,door,window,bed,table,chair,car,bus,train,plane,boat,bike,phone,computer,music,movie,game,ball,friend,brother,sister,family,name,person,people,man,woman,boy,girl,baby,body,hand,foot,head,eye,ear,nose,mouth,hair,face,arm,leg,heart,blood,brain,work,job,office,shop,store,market,bank,hospital,school,park,street,street,city,town,village,country,world,time,day,week,month,year,morning,noon,night,evening,today,tomorrow,yesterday,now,then,soon,always,never,often,sometimes,usually,early,late',
  'red,blue,green,yellow,black,white,gray,pink,purple,orange,brown,color,big,small,long,short,high,low,fast,slow,hot,cold,warm,cool,new,old,young,good,bad,beautiful,ugly,easy,difficult,hard,soft,strong,weak,rich,poor,clean,dirty,full,empty,open,closed,right,wrong,true,false,safe,dangerous,important,necessary,possible,impossible,simple,complex,different,same,similar,special,common,usual,normal,strange,interesting,boring,famous,popular,quiet,loud,polite,rude,kind,nice,friendly,helpful,careful,careless,lucky,unlucky,happy,sad,angry,afraid,tired,sleepy,hungry,thirsty,sick,healthy,clever,stupid,funny,serious',
  'go,come,run,walk,fly,swim,jump,climb,sit,stand,lie,sleep,wake,get,put,take,bring,carry,hold,drop,throw,catch,hit,kick,push,pull,open,close,lock,unlock,break,fix,repair,build,make,create,do,work,study,learn,teach,read,write,speak,talk,say,tell,ask,answer,listen,hear,see,look,watch,smell,taste,touch,feel,think,believe,know,understand,remember,forget,choose,decide,plan,hope,wish,want,need,like,love,hate,enjoy,play,win,lose,beat,buy,sell,pay,spend,cost,save,borrow,lend,give,take,receive,accept,refuse,allow,permit,stop,start,begin,end,finish,continue,keep,stay,leave,arrive,reach,enter,exit,cross,pass,visit,meet,greet,welcome,help,serve',
  'name,call,be,have,do,make,get,go,come,see,look,watch,hear,listen,think,say,tell,ask,answer,work,study,play,eat,drink,sleep,run,walk,jump,swim,fly,drive,ride,travel,trip,visit,meet,wait,help,care,like,love,hate,want,need,wish,hope,plan,decide,choose,use,put,set,take,bring,carry,hold,give,send,receive,get,buy,sell,pay,spend,save,lend,borrow,find,lose,keep,hold,win,lose,beat,hit,break,cut,open,close,lock,start,begin,stop,finish,end,continue,stay,leave,arrive,reach,enter,exit,return,come,back,go,out,stand,sit,lie,fall,rise,drop,raise,lower,grow,change,become,turn,make,do,let,allow,help,show,tell,ask,order,command,force,make,keep,leave,put',
  'because,so,therefore,however,although,though,but,yet,also,too,as,well,such,like,as,than,rather,instead,while,when,before,after,during,since,until,once,now,then,soon,finally,first,last,next,again,once,always,often,sometimes,usually,never,hardly,scarcely,barely,only,just,simply,merely,even,still,already,yet,again,once,now,here,there,where,when,why,how,what,which,who,whom,whose,that,this,these,those,one,ones,all,some,any,no,none,nobody,nothing,anybody,anything,everybody,everything,someone,somebody,thing,something,person,people,man,woman,boy,girl,child,baby,life,death,birth,age,time,day,week,month,year,hour,minute,second,clock,watch,morning,afternoon,evening,night,today,yesterday,tomorrow,weekend,holiday,season,spring,summer,autumn,winter,weather,rain,snow,wind,cloud,sun,sky,star,moon,earth,world,sea,ocean,river,lake,mountain,hill,valley,forest,tree,flower,grass,leaf,root',
  'animal,bird,cat,dog,horse,cow,pig,sheep,chicken,duck,fish,insect,ant,bee,butterfly,elephant,tiger,lion,bear,wolf,fox,rabbit,monkey,snake,frog,crocodile,penguin,eagle,crow,sparrow,parrot,whale,dolphin,shark,octopus,crab,shrimp,lobster,oyster,clam,seal,walrus,deer,moose,elk,reindeer,camel,zebra,giraffe,hippo,rhino,kangaroo,koala,panda,turtle,toad,lizard,salamander,newt,gecko,iguana,tarantula,scorpion,centipede,millipede,snail,slug,worm,leeches,mite,flea,tick,louse,cricket,grasshopper,dragonfly,moth,wasp,hornet,yellowjacket,termite,roach,cockroach,ladybug,beetle,weevil,aphid,spider,tick,flea,lice,fruit,apple,banana,orange,grape,pear,peach,plum,cherry,strawberry,blueberry,raspberry,watermelon,melon,pineapple,mango,lemon,lime,kiwi,coconut,avocado,papaya,guava,dragonfruit,pomegranate,fig,date,olive,raisin,prune,cranberry,blackberry,boysenberry,gooseberry,currant',
  'vegetable,potato,tomato,onion,garlic,ginger,carrot,cabbage,broccoli,cauliflower,spinach,lettuce,cucumber,pepper,chili,pumpkin,squash,zucchini,eggplant,peas,beans,lentils,chickpeas,tofu,mushroom,corn,wheat,rice,oats,barley,rye,millet,sorghum,quinoa,buckwheat,flour,bread,toast,bagel,croissant,muffin,pancake,waffle,cereal,porridge,oatmeal,grits,granola,crackers,biscuits,cookies,cake,pastry,pudding,custard,icecream,yogurt,cheese,butter,margarine,cream,milk,soymilk,almondmilk,coconutmilk,eggs,omelette,frittata,scrambled,boiled,fried,bacon,sausage,ham,turkey,chicken,beef,pork,lamb,veal,duck,goose,quail,rabbit,venison,bison,elk,caribou,mutton,steak,roast,stew,soup,broth,consomme,bouillon,stock,gravy,sauce,dressing,mayo,ketchup,mustard,relish,pickles,salsa,guacamole,dip,spread,jam,jelly,honey,syrup,sugar,salt,pepper,vinegar,oil,butter',
  'home,house,apartment,flat,condo,villa,cottage,cabin,hut,shack,bungalow,mansion,palace,castle,fort,tower,bridge,tunnel,road,street,avenue,alley,path,trail,highway,freeway,expressway,interstate,boulevard,circle,square,plaza,market,store,shop,supermarket,grocery,mall,department,boutique,outlet,warehouse,factory,plant,mill,workshop,studio,office,building,skyscraper,church,temple,mosque,synagogue,shrine,monastery,convent,library,museum,gallery,theater,cinema,stadium,gym,pool,spa,salon,barbershop,bakery,butcher,deli,cafe,restaurant,bistro,diner,tavern,pub,bar,lounge,club,disco,casino,hotel,inn,hostel,resort,bedandbreakfast,motel,lodge,chalet,villa,cabin,yurt,tent,campsite,caravan,motorhome,rv,park,playground,zoo,aquarium,garden,greenhouse,orchard,field,meadow,pasture,farm,ranch,stable,barn,coop,pen,kennel,cattery,vet',
  'transportation,bus,train,subway,metro,rail,tram,trolley,streetcar,monorail,maglev,plane,airplane,aircraft,jet,helicopter,glider,balloon,zeppelin,airship,rocket,spaceship,shuttle,boat,ship,vessel,yacht,sailboat,canoe,kayak,raft,ferry,cruise,liner,tanker,freighter,tugboat,barge,pontoon,catamaran,trimaran,warship,destroyer,submarine,car,automobile,vehicle,truck,lorry,van,pickup,suv,sedan,coupe,convertible,hatchback,stationwagon,sports car,racecar,policecar,taxi,cab,limousine,minivan,camper,rv,motorcycle,bike,bicycle,moped,scooter,skateboard,rollerblades,skates,sled,sledge,toboggan,skis,snowboard,carriage,chariot,wagon,cart,trolley,hansom,cabriolet,roadster,lorry,hearse,tractor,excavator,bulldozer,forklift,crane,cementmixer,firetruck,ambulance,mailtruck,garbagetruck,towtruck,carmover,deliverytruck,semitruck,eighteenwheeler,tank,armoredvehicle,humvee,jeep,quad,atv,dirtbike,moped,vespa,scooter,segway,unicycle,tricycle',
  'body,head,hair,face,forehead,eyebrow,eyelash,eye,nose,cheek,mouth,lips,teeth,tongue,chin,ear,neck,shoulder,arm,elbow,wrist,hand,finger,thumb,nail,knuckle,palm,fist,chest,breast,belly,waist,hip,leg,knee,shin,calf,ankle,foot,heel,toe,sole,arch,skin,bone,muscle,nerve,blood,vein,artery,heart,lungs,liver,kidney,stomach,intestine,bladder,spine,rib,skull,brain,eyeball,pupil,iris,retina,cataract,glasses,contactlens,hearingaids,toothbrush,toothpaste,floss,mouthwash,comb,brush,razor,shaver,soap,shampoo,conditioner,bodywash,deodorant,cologne,perfume,makup,foundation,powder,blush,eyeliner,mascara,lipstick,lipgloss,nailpolish,manicure,pedicure,massage,facial,cleanse,toner,moisturizer,sunscreen,serum,cream,lotion,balm,salve,ointment,medication,medicine,pill,capsule,tablet,shot,vaccine,injection,dose,prescription,doctor,nurse,patient,clinic,hospital,pharmacy,druggist,pharmacist,dentist,orthodontist,eye doctor,optician,chiropractor,physical therapist,therapist,psychologist,psychiatrist,counselor,specialist,generalist,practitioner',
  'weather,sunny,cloudy,rainy,snowy,windy,stormy,foggy,humid,dry,wet,cold,hot,warm,cool,chilly,freezing,boiling,breezy,calm,clear,overcast,drizzle,shower,downpour,flood,drought,heatwave,coldfront,warmfront,humidity,dew,frost,hail,ice,sleet,snowfall,blizzard,avalanche,landslide,earthquake,tsunami,volcano,tornado,hurricane,typhoon,cyclone,monsoon,breeze,gale,gust,squall,whirlwind,duststorm,sandstorm,thunder,lightning,rainbow,fog,mist,haze,smog,smoke,ash,cloud,sky,sun,moon,star,comet,asteroid,meteor,eclipse,solstice,equinox,spring,summer,autumn,winter,season,climate,forecast,report,weatherman,meteorologist,barometer,thermometer,raincoat,umbrella,galoshes,boots,scarf,mittens,gloves,coat,jacket,sweater,hoodie,cardigan,parka,anorak,windbreaker,raincoat,poncho',
  'food,breakfast,lunch,dinner,supper,snack,dessert,appetizer,entree,maincourse,side,salad,soup,stew,curry,stirfry,roast,grill,bbq,barbecue,sauce,gravy,dressing,spice,herb,seasoning,flavor,taste,smell,aroma,texture,crunchy,crispy,soft,chewy,tender,tough,juicy,greasy,oily,rich,heavy,light,healthy,junk,fastfood,delivery,takeout,dinein,reservation,menu,waiter,waitress,chef,cook,bartender,cashier,check,receipt,tip,order,bill,pay,cash,creditcard,debitcard,wallet,change,coin,note,bill,dollar,euro,yuan,yen,pound,dinar,rupee,peso,real,won,ringgit,baht,rupiah,dirham,riyal,rand,shilling,lira,shekel,zloty,koruna,forint,leu,lev,denar,kuna,dinar,franc,mark,lire,escudo,punt,peseta,guilder,florin,ducat,sovereign,guinea,farthing,shilling,penny,cent,quarter,dime,nickel,lottery,jackpot,prize,reward,bonus,commission,salary,wage,income,earning,paycheck,raise,promotion,benefit,insurance,pension,tax,tariff,duty,levy,charge,fee,fare,toll,rent,mortgage,lease,loan,debt,credit,interest,principal',
  'travel,trip,journey,voyage,expedition,tour,excursion,outing,pilgrimage,migration,commute,flight,drive,ride,sail,cruise,hike,camp,trek,climb,dive,snorkel,surf,ski,snowboard,skate,cycle,pedal,glide,soar,land,takeoff,touchdown,departure,arrival,transit,layover,stopover,connecting,boarding,gatesecurity,passport,visa,immigration,customs,declare,baggage,luggage,suitcase,backpack,duffel,traveler,tourist,backpacker,guide,map,compass,gps,navigation,direction,landmark,monument,statue,ruins,ancient,historic,museum,gallery,exhibition,display,attraction,souvenir,gift,postcard,photo,photograph,picture,selfie,vlog,camera,video,memory,experience,adventure,discovery,exploration,encounter,meeting,language,phrase,word,sentence,translation,interpreter,translator,foreign,local,native,culture,custom,tradition,festival,celebration,ceremony,parade,fireworks,feast,banquet,party,reception,gathering,get-together,reunion,wedding,anniversary,birthday,newyear,christmas,easter,thanksgiving,halloween,valentines',
  'money,bank,account,savings,checking,deposit,withdraw,transfer,balance,statement,branch,atm,currency,exchange,rate,conversion,fee,commission,charge,cost,price,expense,spending,budget,saving,investment,stock,bond,fund,portfolio,asset,liability,equity,capital,cash,coin,bill,note,change,profit,loss,revenue,income,expense,gross,net,value,worth,wealth,rich,poor,debt,loan,mortgage,credit,debit,interest,principal,insurance,policy,claim,premium,discount,coupon,voucher,promotion,sale,clearance,markdown,rebate,refund,return,exchange,receipt,invoice,receipt,quotation,estimate,payment,paycheck,salary,wage,income,tax,deduction,withholding,refund,audit,accountant,bookkeeper,cfo,finance,financial,economic,economy,market,demand,supply,inflation,recession,depression,boom,bust,growth,development,progress,improvement,advance,technology,science,research,study,experiment,discovery,invention,innovation,creation',
  'communication,language,word,speech,talk,conversation,dialogue,monologue,discussion,debate,argument,negotiation,compromise,agreement,contract,deal,arrangement,plan,proposal,suggestion,recommendation,idea,thought,opinion,view,point,perspective,attitude,belief,faith,religion,god,prayer,spirit,soul,mind,brain,intelligence,knowledge,wisdom,understanding,skill,ability,talent,gift,genius,expert,professional,specialist,amateur,beginner,novice,expert,master,teacher,mentor,coach,trainer,instructor,professor,lecturer,scholar,researcher,scientist,engineer,architect,designer,artist,painter,sculptor,musician,singer,composer,dancer,actor,actress,director,producer,writer,author,poet,journalist,editor,photographer,chef,cook,baker,butcher,farmer,gardener,worker,employee,employer,manager,boss,leader,chief,director,president,chairman,ceo,cfo,cto,coo,founder,owner,partner,associate,colleague,teammate,friend,companion,ally,enemy,rival,competitor,opponent,challenger,contender,favorite,underdog',
  'nature,environment,earth,planet,world,universe,galaxy,star,sun,moon,planet,orbit,gravity,matter,energy,force,motion,movement,velocity,acceleration,speed,distance,length,width,height,depth,breadth,size,volume,weight,mass,density,temperature,pressure,atmosphere,climate,weather,season,water,ocean,sea,river,lake,stream,creek,pond,puddle,spring,waterfall,glacier,ice,snow,rain,storm,thunder,lightning,wind,breeze,gust,gale,hurricane,tornado,typhoon,flood,drought,earthquake,volcano,tsunami,landslide,avalanche,mountain,hills,valley,plain,desert,forest,wood,jungle,savanna,tundra,taiga,wetland,marsh,swamp,bog,fjord,coast,shore,beach,cliff,canyon,mesa,butte,plateau,ridge,peak,summit,base,foot,slope,grade,terrain,landscape,scenery,view,sight,scene,panorama,vista,horizon',
  'health,fitness,exercise,workout,training,strength,power,endurance,stamina,flexibility,balance,agility,speed,jog,run,sprint,walk,swim,cycle,spin,yoga,pilates,meditation,stretch,warmup,cooldown,hydration,nutrition,diet,meal,breakfast,lunch,dinner,snack,food,eat,drink,chew,swallow,digest,absorb,assimilate,calorie,protein,carbohydrate,fat,vitamin,mineral,fiber,water,juice,smoothie,energy,boost,recover,rest,sleep,nap,insomnia,depression,anxiety,stress,tension,relax,calm,peace,happiness,joy,pleasure,comfort,content,satisfaction,fulfillment,achievement,success,failure,challenge,obstacle,setback,comeback,perseverance,patience,determination,motivation,inspiration,discipline,habit,routine,schedule,plan,goal,objective,target,aim,dream,aspiration,ambition,wish,desire,need,want,require,demand',
  'work,business,company,corporation,firm,enterprise,organization,institution,agency,bureau,department,division,section,unit,team,staff,personnel,workforce,employee,employer,boss,manager,supervisor,director,executive,officer,leader,chief,president,vicepresident,chairman,secretary,assistant,clerk,receptionist,cashier,accountant,auditor,analyst,consultant,advisor,lawyer,attorney,judge,jury,witness,defendant,plaintiff,case,court,trial,hearing,appeal,verdict,sentence,punishment,penalty,fine,crime,criminal,offense,offender,law,rule,regulation,policy,standard,guideline,procedure,process,method,approach,strategy,tactic,plan,scheme,system,framework,model,pattern,structure,design,blueprint,prototype,version,edition,release,update,upgrade,install,configure,setup,operation,function,feature,tool,instrument,device,equipment,machinery,apparatus,mechanism,engine,motor,generator,pump,valve,pipeline,conveyor,assembly,production,manufacture,factory,plant,industry,sector,market,trade,commerce,export,import,exchange,transaction,deal,agreement,contract,supply,demand,distribution,logistics,shipping,delivery,warehouse,stock,inventory',
  'education,learning,teaching,training,study,homework,assignment,project,research,experiment,exam,test,quiz,grade,score,mark,result,report,essay,paper,thesis,dissertation,book,textbook,notebook,pen,pencil,eraser,ruler,scissors,glue,tape,calculator,computer,laptop,tablet,smartphone,keyboard,mouse,printer,scanner,camera,projector,screen,monitor,board,chalk,whiteboard,flipchart,classroom,lecture,seminar,workshop,tutorial,lesson,course,curriculum,program,degree,diploma,certificate,scholarship,tuition,university,college,school,academy,institute,faculty,department,professor,teacher,instructor,mentor,coach,tutor,student,pupil,graduate,undergraduate,postgraduate,phd,doctor,master,bachelor,associate,degree,ceremony,graduation,commencement,alumni,reunion,campus,dorm,library,laboratory,auditorium,gymnasium,stadium,cafeteria,quad,walkway',
  'technology,computer,software,hardware,network,internet,web,site,page,link,search,browser,email,message,chat,forum,blog,vlog,podcast,socialmedia,facebook,twitter,instagram,tiktok,snapchat,whatsapp,wechat,weibo,qq,line,telegram,signal,zoom,skype,meet,teams,platform,app,application,program,software,update,version,download,upload,install,uninstall,restart,shutdown,login,logout,password,username,account,profile,privacy,security,virus,malware,hacker,attack,defense,protection,encryption,decryption,data,information,knowledge,content,digital,electronic,virtual,online,offline,cloud,server,database,storage,memory,processor,chip,circuit,device,gadget,smartphone,tablet,laptop,desktop,monitor,keyboard,mouse,printer,scanner,headphone,earbud,microphone,speaker,camera,webcam,drone,robot,ai,artificialintelligence,machinelearning,algorithm,code,coding,programming,developer,programmer,engineer,designer,ux,ui,user,interface,experience,design,prototype,mockup,wireframe,debug,test,fix,optimize,performance,speed,quality,reliable,stable,efficient,effective,powerful,useful,helpful,convenient,user-friendly,intuitive,responsive'
]
const FALLBACK = [...new Set(FALLBACK_RAW.join(',').split(',').map(s => s.trim()).filter(Boolean))]

/* ---------- 工具 ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms))
function esc(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/* ---------- 有道词典抓取 ---------- */
function fetchDict(word) {
  return new Promise(resolve => {
    const url = 'https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(word)
    const req = https.get(url, { headers: { 'User-Agent': UA, 'Referer': 'https://dict.youdao.com/' }, timeout: 12000 }, res => {
      let d = ''
      res.on('data', c => { d += c; if (d.length > 3e6) req.destroy() })
      res.on('end', () => {
        try {
          d = d.replace(/^\uFEFF/, '')
          const j = JSON.parse(d)
          const w = j.ec && j.ec.word && j.ec.word[0]
          if (!w) return resolve(null)
          const phone = String(w.phone || w.ukphone || w.usphone || '').trim()
          let meaning = ''
          if (Array.isArray(w.trs)) {
            const parts = []
            for (const t of w.trs) {
              const l = t && t.tr && t.tr[0] && t.tr[0].l
              if (l && l.i) parts.push(String(l.i))
              if (parts.length >= 3) break
            }
            meaning = parts.join('；').replace(/<[^>]+>/g, '').trim().slice(0, 120)
          }
          let example = ''
          try {
            const sents = j.simple && j.simple.word && j.simple.word[0] && j.simple.word[0].sents
            if (Array.isArray(sents) && sents[0] && sents[0].s) example = String(sents[0].s).replace(/<[^>]+>/g, '').trim().slice(0, 110)
          } catch (e) {}
          if (!phone && !meaning) return resolve(null)
          resolve({ phonetic: phone ? '/' + phone + '/' : '', meaning, example })
        } catch (e) { resolve(null) }
      })
    })
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
  })
}

/* 清洗有道返回的数据（重音符号 / 换行 / HTML） */
function cleanInfo(info) {
  if (!info) return info
  return {
    phonetic: String(info.phonetic || '').replace(/\\'/g, 'ˈ').replace(/'/g, '').replace(/\s+/g, ' ').trim(),
    meaning: String(info.meaning || '').replace(/<[^>]+>/g, '').replace(/[\r\n]+/g, '；').replace(/\s+/g, ' ').trim(),
    example: String(info.example || '').replace(/<[^>]+>/g, '').replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

/* 词性 tags */
function posTag(meaning) {
  const m = /^\s*((?:vt|vi|v|n|adj|adv|prep|conj|num|art|pron|aux|interj|abbr)\.)/i.exec(meaning)
  if (!m) return ['核心词']
  const map = { n: '名词', v: '动词', vt: '动词', vi: '动词', adj: '形容词', adv: '副词', prep: '介词', conj: '连词', num: '数词', art: '冠词', pron: '代词', aux: '助动词', interj: '感叹词', abbr: '缩写' }
  return [map[m[1].replace(/\./g, '').toLowerCase()] || '核心词']
}

/* ---------- 词表加载 ---------- */
function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA }, timeout: 25000 }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)) }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.on('error', reject)
  })
}
async function loadVocab() {
  if (VOCAB_FILE) {
    const txt = fs.readFileSync(VOCAB_FILE, 'utf8')
    return txt.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(s => s && !/\s/.test(s))
  }
  try {
    const t = await download(GOOGLE_URL)
    const list = t.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(s => s && !/\s/.test(s))
    console.log('✓ 词表下载成功：' + list.length + ' 词')
    return list
  } catch (e) {
    console.warn('✗ 词表下载失败（' + e.message + '），使用内置兜底词表 ' + FALLBACK.length + ' 词')
    return FALLBACK
  }
}

/* ---------- 生成 words.js ---------- */
const BOOKS_NEW = `const BOOKS = [
  { bookId: 'daily', name: '日常高频词', desc: '生活场景必备 100 词（10 关）', emoji: '🌞', color: '#4f6ef7' },
  { bookId: 'cet4', name: '四六级核心', desc: '考试高频词 100（10 关）', emoji: '🎓', color: '#7b5cf0' },
  { bookId: 'travel', name: '旅行必备', desc: '出境游常用 60 词（6 关）', emoji: '✈️', color: '#22a06b' },
  { bookId: 'core1', name: '核心词汇 · 上', desc: '高频 2500 词（250 关）', emoji: '🔤', color: '#e26d5a' },
  { bookId: 'core2', name: '核心词汇 · 下', desc: '进阶 2500 词（250 关）', emoji: '🧠', color: '#2a9d8f' }
]`

function entryText(w, info, id, bookId) {
  const ph = info.phonetic ? `phonetic: '${esc(info.phonetic)}', ` : ''
  const ex = info.example ? `example: '${esc(info.example)}', ` : ''
  const tag = JSON.stringify(posTag(info.meaning))
  return `  { id: '${id}', bookId: '${bookId}', spell: '${w}', ${ph}emoji: '📖', meaning: '${esc(info.meaning)}', ${ex}tags: ${tag} }`
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {}

  // 现有词库（保留）—— 从文件文本解析词条，避免 require 坏文件
  const rawText = fs.readFileSync(WORDS_FILE, 'utf8')
  const origEntries = []
  for (const l of rawText.split('\n')) {
    const m = /^\s*\{ id: '([a-z])\d+'\s*,\s*bookId/.exec(l)
    if (!m || m[1] === 'e') continue          // 只保留人工词条（d/c/t）
    if (((l.match(/'/g) || []).length % 2) !== 0) continue // 跳过引号未配对的坏行
    origEntries.push(l.replace(/\r$/, '').trim().replace(/,\s*$/, ''))
  }
  const existingSpell = new Set()
  for (const l of origEntries) {
    const mm = /spell: '([^']+)'/.exec(l)
    if (mm) existingSpell.add(mm[1].toLowerCase())
  }

  // 1. 词表 → 过滤已有词 → 取前 TARGET_COUNT
  const allVocab = [...new Set(await loadVocab())]
  // 过滤：只保留纯小写字母词；长度 <3 需在白名单
  const TWO_OK = new Set(['am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'ok', 'on', 'or', 'so', 'to', 'up', 'us', 'we', 'hi', 'tv', 'cd', 'pc', 'ad', 'ex', 'pm', 'vs', 'mr', 'ms', 'dr', 'st', 'mt', 'id', 'ny', 'la', 'dc', 'tv'])
  const isClean = w => /^[a-z]+$/.test(w) && (w.length >= 3 || TWO_OK.has(w))
  const fresh = allVocab.filter(w => isClean(w) && !existingSpell.has(w) && !STOP.has(w))
  console.log('现有词条：' + origEntries.length + '，待新增可用词：' + fresh.length)
  let target = fresh.slice(0, TARGET_COUNT + 300) // 多取备用（抓取失败的剔除）
  if (FROM > 0 || TO > 0) target = fresh.slice(FROM, TO || fresh.length)
  if (LIMIT > 0) target = target.slice(0, LIMIT)
  console.log('本次抓取目标：' + target.length + ' 词')

  // 2. 抓取释义/音标（断点续传 + 并发）
  const picked = [] // { word, info }
  let done = 0
  for (let i = 0; i < target.length; i += CONC) {
    const batch = target.slice(i, i + CONC)
    const out = await Promise.all(batch.map(async w => {
      if (cache[w] !== undefined) return cache[w]
      let val = null
      for (let r = 0; r < 2 && !val; r++) val = await fetchDict(w)
      cache[w] = val
      return val
    }))
    batch.forEach((w, k) => {
      const info = cleanInfo(out[k])
      if (info && info.meaning) picked.push({ word: w, info })
    })
    done += batch.length
    if (done % 500 < CONC) { console.log('  进度 ' + done + '/' + target.length); fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)) }
    await sleep(GAP)
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache))
  console.log('✓ 抓取完成：成功 ' + picked.length + ' / ' + target.length)

  // 3. 组装新词条（前 HALF → core1，其余 → core2）
  const use = picked.slice(0, TARGET_COUNT)
  const newEntries = use.map((p, idx) => {
    const id = 'e' + String(idx + 1).padStart(4, '0')
    const bookId = idx < HALF ? 'core1' : 'core2'
    return entryText(p.word, p.info, id, bookId)
  })

  // 测试模式：只打印样例，不写文件
  if (LIMIT > 0) {
    console.log('—— 测试模式（--limit），不写入文件，样例 5 条 ——')
    use.slice(0, 5).forEach(p => console.log(entryText(p.word, p.info, 'e0001', 'core1')))
    return
  }

  // 4. 整文件重建 words.js
  const nl = '\n'
  const HEADER = '// data/words.js —— 内置词库（M1 单机可用；后续可切换云数据库 words 集合）\n' +
    '// 字段：id, bookId, spell, phonetic, emoji, meaning, example, root, mnemonic, tags\n' +
    '// 由 scripts/gen-words.js 自动生成：人工词条在前，机器词条在后\n'
  const TAIL = '\n' +
    '/* 把词库切成关卡，每关 LEVEL_SIZE 个词 */\n' +
    'const LEVEL_SIZE = 10\n' +
    'function getBooks() { return BOOKS }\n' +
    'function getWords(bookId) { return WORDS.filter(w => w.bookId === bookId) }\n' +
    'function getWord(id) { return WORDS.find(w => w.id === id) }\n' +
    'function getLevelWords(bookId, levelIdx) {\n' +
    '  const list = getWords(bookId)\n' +
    '  const start = levelIdx * LEVEL_SIZE\n' +
    '  return list.slice(start, start + LEVEL_SIZE)\n' +
    '}\n' +
    'function getLevelCount(bookId) {\n' +
    '  return Math.ceil(getWords(bookId).length / LEVEL_SIZE)\n' +
    '}\n' +
    '\n' +
    'module.exports = {\n' +
    '  BOOKS, WORDS,\n' +
    '  getBooks, getWords, getWord, getLevelWords, getLevelCount, LEVEL_SIZE\n' +
    '}\n'
  const body = [
    HEADER,
    BOOKS_NEW,
    '',
    'const WORDS = [',
    origEntries.join(',\n'),
    origEntries.length ? ',' : '',
    newEntries.join(',\n'),
    ']',
    TAIL
  ].join(nl)
  fs.writeFileSync(WORDS_FILE, body, 'utf8')
  const total = origEntries.length + use.length
  console.log('✓ 已写入 ' + WORDS_FILE)
  console.log('  原词条 ' + origEntries.length + ' + 新增 ' + use.length + ' = ' + total + ' 词')
  console.log('  core1: ' + use.filter((_, i) => i < HALF).length + ' 词（250 关）')
  console.log('  core2: ' + use.filter((_, i) => i >= HALF).length + ' 词（' + Math.ceil(use.filter((_, i) => i >= HALF).length / 10) + ' 关）')
  console.log('  文件大小：' + (fs.statSync(WORDS_FILE).size / 1024).toFixed(0) + ' KB')
}

main().catch(e => { console.error(e); process.exit(1) })
