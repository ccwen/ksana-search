var indexOfSorted=require("./plist").indexOfSorted;

var getSeg=function(engine,fileid,segid,opts,cb,context) {
	if (typeof opts=="function") {
		context=cb;
		cb=opts;
		opts={};
	}

	var fileOffsets=engine.get("fileoffsets");
	var segpaths=["filecontents",fileid,segid];
	var segnames=engine.getFileSegNames(fileid);
	var vpos=engine.fileSegToVpos(fileid,segid);

	engine.get(segpaths,function(text){
		var out=text;
		if (opts.span) out=addspan.apply(engine,[text,vpos]);
		else if(opts.token) out=addtoken.apply(engine,[text,vpos]);
		cb.apply(context||engine.context,[{text:out,file:fileid,seg:segid,segname:segnames[segid]}]);
	});
}

var getSegSync=function(engine,fileid,segid) {
	var fileOffsets=engine.get("fileoffsets");
	var segpaths=["filecontents",fileid,segid];
	var segnames=engine.getFileSegNames(fileid);

	var text=engine.get(segpaths);
	return {text:text,file:fileid,seg:segid,segname:segnames[segid]};
}

var getKeyByTagName=function(tagname) {
	var out=[];
	out.push(["fields",tagname]);
	out.push(["fields",tagname+"_vpos"]);
	out.push(["fields",tagname+"_sorted"]);
	out.push(["fields",tagname+"_sorted_idx"]);
	return out;
}
var getPage=function(engine,pageid,cb,context) {
	getPageRange(engine,pageid,function(res){
		getRange.call(engine,res.start,res.end,function(pagetext){
			res.text=pagetext;
			cb.call(context,res);
		});
	})
}
var getPageRange=function(engine,pageid,cb,context) {
	var keys=getKeyByTagName("pb");
	engine.get(keys,function(data){
		var vals=data[0], vpos=data[1], sorted=data[2],sorted_idx=data[3];
		var i=indexOfSorted(sorted,pageid);
		var idx=sorted_idx[i];
		var res={start:vpos[idx]+1,end:vpos[idx+1],text:""};
		if (vals[idx]==pageid) {
			var nextpageid=vals[idx+1];
			if (!nextpageid) res.end=engine.get("meta").vsize;
		} else {//always return top page
			res={start:0,end:vpos[0],text:""};
		}
		cb.call(context,res);
	})
}
var getTextByTag=function(tag,cb){

}
var getRange=function(start,end,cb,context){
	var fseg=this.fileSegFromVpos(start);
	var fseg_end=this.fileSegFromVpos(end);
	var keys=[];
	for (var f=fseg.file;f<fseg_end.file+1;f++){
		var range=this.getFileRange(f);

		var from=0, to=range.end-range.start;
		if (f===fseg.file) from=fseg.seg;
		if (f===fseg_end.file) to=fseg_end.seg;
		
		for (var s=from;s<to+1;s++){
			keys.push(["filecontents",f,s]);
		}
	}
	var startsegvpos=this.fileSegToVpos(fseg.file,fseg.seg);
	var endsegvpos=this.fileSegToVpos(fseg_end.file,fseg_end.seg);
	//console.log(fseg,startsegvpos,endsegvpos);
	var startvpos=start-startsegvpos;
	var lastvpos=end-endsegvpos;

	//console.log(start,end,startvpos,lastvpos);
	var combinetext=function(text,idx,texts) {
		var out=text;
		if (idx==0 || idx===texts.length-1) {
			var tokenized=this.analyzer.tokenize(text);
			var now=0;
			out=tokenized.tokens.map(function(t){
				if (!this.analyzer.isSkip(t))now++;
				if (now<startvpos && idx===0) return "";
				else if (now>lastvpos && idx===texts.length-1) return "";
				else return t;
			}.bind(this)).join("");
		}
		return out;
	}
	this.get(keys,function(data){
		cb(data.map(combinetext.bind(this)).join(""));
	}.bind(this));
}

var getFile=function(engine,fileid,cb) {
	var filename=engine.get("filenames")[fileid];
	var segnames=engine.getFileSegNames(fileid);
	var filestart=engine.get("fileoffsets")[fileid];
	var offsets=engine.getFileSegOffsets(fileid);
	var pc=0;
	engine.get(["fileContents",fileid],true,function(data){
		var text=data.map(function(t,idx) {
			if (idx==0) return ""; 
			var pb='<pb n="'+segnames[idx]+'"></pb>';
			return pb+t;
		});
		cb({texts:data,text:text.join(""),segnames:segnames,filestart:filestart,offsets:offsets,file:fileid,filename:filename}); //force different token
	});
}

module.exports=	{file:getFile,seg:getSeg,range:getRange,page:getPage,pageRange:getPageRange}