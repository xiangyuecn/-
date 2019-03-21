/*
获取所有城市名称原始数据

在以下页面执行
http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/2018/index.html
*/
(function(){
var Year=2018;
var LoadMaxLevel=4;//采集几层
var Level={
	1:{n:"省",k:"shen"},
	2:{n:"市",k:"si"},
	3:{n:"区",k:"qu"},
	4:{n:"镇",k:"zhen"}
};

window.StopLoad=false;//true手动停止运行，"End"假装采集完成
var DATA=window.DATA||[];

var Load_Thread_Count=4;//模拟线程数
var Load_Max_Try=3;//错误重试次数

var Load_Wait_Child=91;//此城市下级列表已抓取完毕，等待子级完成抓取
var Load_Full_End=92;//此城市包括下级全部抓取完毕

if(!window.URL){
	throw new Error("浏览器版本太低");
};
function ajax(url,True,False){
	var ajax=new XMLHttpRequest();
	ajax.timeout=1000;
	ajax.open("GET",url);
	ajax.onreadystatechange=function(){
		if(ajax.readyState==4){
			if(ajax.status==200){
				True(ajax.responseText);
			}else{
				False();
			}
		}
	}
	ajax.send();
}

function cityClass(name,url,code){
	this.name=name;
	this.url=url;
	this.code=code;
	this.child=[];
	this.load=0;
}
cityClass.prototype={
	getValue:function(){
		var obj={name:this.name,code:this.code,child:[]};
		for(var i=0;i<this.child.length;i++){
			obj.child.push(this.child[i].getValue());
		}
		return obj;
	}
}



function load_shen_all(True){
	var path="http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/"+Year;
	ajax(path+"/index.html",function(text){
		var reg=/href='(.+?)'>(.+?)<br/ig,match;
		var idx;
		if((idx=text.indexOf("<tr class='provincetr'>"))+1){
			reg.lastIndex=idx;
			while(match=reg.exec(text)){
				var url=match[1];
				if(url.indexOf("//")==-1 && url.indexOf("/")!=0){
					url=path+"/"+url;
				}
				var name=match[2];
				DATA.push(new cityClass(name,url,0));
			}
			
			save();
			True();
		}else{
			console.error("未发现省份数据");
		}
	},function(){
		console.error("读取省份列表出错","程序终止");
	});
}



var logX=$('<div class="LogX" style="position: fixed;bottom: 80px;right: 100px;padding: 50px;background: #0ca;color: #fff;font-size: 16px;width: 600px;"></div>');
$("body").append(logX);
var logXn=0;
function LogX(txt){
	logXn++;
	if(logXn%100==0){
		logX.text(txt);
	}
};

function load_x_childs(itm, next){
	var city=itm.obj,levelObj=Level[itm.level],levelNextObj=Level[itm.level+1];
	city.load++;
	if(city.load>Load_Max_Try){
		console.error("读取"+levelObj.n+"["+city.name+"]超过"+Load_Max_Try+"次");
		next();
		return;
	};
	
	LogX("读取"+levelObj.n+"["+city.name+"]"+getJD());
	
	ajax(city.url,function(text){
		var reg=/class='(?:citytr|countytr|towntr|villagetr)'.+?<\/tr>/ig;
		var match;
		while(match=reg.exec(text)){
			var reg2=/class='(?:citytr|countytr|towntr|villagetr)'.+?(?:<td><a href='(.+?)'>(.+?)<.+?'>(.+?)<|<td>(.+?)<.+?<td>(.+?)<)/ig;
			var match2;
			if(match2=reg2.exec(match[0])){
				var url=match2[1]||"";
				if(url && url.indexOf("//")==-1 && url.indexOf("/")!=0){
					url=city.url.substring(0,city.url.lastIndexOf("/"))+"/"+url;
				}
				var code=match2[2]||match2[4];
				var name=match2[3]||match2[5];
				if(!url&&name=="市辖区"){
					//NOOP
				}else{
					city.child.push(new cityClass(name,url,code));
				};
			}else{
				console.error("未知模式:",city,match[0]);
				city.load=Load_Max_Try;
				
				next();
				return;
			};
		};
		
		delete city.url;
		city.load=Load_Wait_Child;
		
		JD[levelNextObj.k+"_count"]+=city.child.length;
		
		if(itm.level<3)save();
		next();
	},function(){
		load_x_childs(itm, next);
	});
};









var load_end=function(isErr){
	save();
	StopLoad="End";
		
	if(isErr){
		console.error("出错终止", getJD());
		return;
	}
	
	console.log("完成："+(Date.now()-RunLoad.T1)/1000+"秒", getJD());
	
	var data=[];
	window.CITY_LIST=data;
	for(var i=0;i<DATA.length;i++){
		data.push(DATA[i].getValue());
	}
	
	var url=URL.createObjectURL(
		new Blob([
			new Uint8Array([0xEF,0xBB,0xBF])
			,"var CITY_LIST="
			,JSON.stringify(data,null,"\t")
		]
		,{"type":"text/plain"})
	);
	var downA=document.createElement("A");
	downA.innerHTML="下载查询好城市的文件";
	downA.href=url;
	downA.download="data.txt";
	document.body.appendChild(downA);
	downA.click();
	
	console.log("--完成--");
};




var threadCount=0;
function thread(){
	threadCount++;
	var itm=findNext(DATA,1);
	if(!itm||!itm.obj){
		//最后循环full计数
		findNext(DATA,1);
		findNext(DATA,1);
		findNext(DATA,1);
		findNext(DATA,1);
		
		threadCount--;
		if(threadCount==0){
			load_end(!!itm);
		};
		return;
	};
	
	var next=function(){
		threadCount--;
		thread();
	};
	
	load_x_childs(itm, next);
};
function findNext(childs,level,parent){
	if(level>=LoadMaxLevel){//超过了需要加载的层次
		setFullLoad(parent,level-1);
		return;
	};
	if(StopLoad){
		//已停止
		if(StopLoad=="End"){
			return;
		};
		
		//手动中断运行
		return {};
	};
	
	var isFull=true;
	for(var i=0;i<childs.length;i++){
		var itm=childs[i];
		//处理完成了的
		if(itm.load==Load_Full_End){
			continue;
		};
		isFull=false;
		
		if(itm.load==Load_Wait_Child){
			//看看下级有没有没处理的
			var rtv=findNext(itm.child,level+1,itm);
			if(rtv){
				return rtv;
			};
		}else if(itm.load>Load_Max_Try){
			//存在加载失败的，中断运行
			return {};
		};
		
		//加载这个
		if(!itm.load){
			return {obj:itm,level:level};
		};
	};
	
	if(isFull&&parent){
		setFullLoad(parent,level-1);
	};
};
function setFullLoad(itm,level){
	if(itm.load==Load_Wait_Child){
		JD[Level[level].k+"_ok"]++;
	};
	itm.load=Load_Full_End;
};
function clearLoadErr(childs){
	for(var i=0;i<childs.length;i++){
		var itm=childs[i];
		itm.load=itm.load>50?itm.load:!itm.url?1:0;
		clearLoadErr(itm.child);
	};
};




function save(){
	//localStorage["load_data"]=JSON.stringify(DATA); 数据太多无法存储
}
function getJD(){
	var str="省:"+JD.shen_ok+"/"+JD.shen_count;
	str+=" 市:"+JD.si_ok+"/"+JD.si_count;
	str+=" 区:"+JD.qu_ok+"/"+JD.qu_count;
	str+=" 镇:"+JD.zhen_count;
	return " >>进度："+str;
};
var JD={
	shen_ok:0
	,shen_count:0
	,si_ok:0
	,si_count:0
	,qu_ok:0
	,qu_count:0
	,zhen_count:0
};
window.RunLoad=function(){
	RunLoad.T1=Date.now();
	
	function start(){
		JD.shen_count=DATA.length;
		
		for(var i=0;i<Load_Thread_Count;i++){
			thread();
		};
	};
	
	
	console.log("如果是新运行，需要自行清理load_data存储数据");
	var data=localStorage["load_data"];
	if(data){
		DATA=JSON.parse(data);
		clearLoadErr(DATA);
		start();
	}else{
		load_shen_all(start);
	}
	window.DATA=DATA;
}
})();//@ sourceURL=console.js


//立即执行代码
RunLoad()