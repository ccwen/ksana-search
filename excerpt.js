var plist=require("./plist");
var fetchtext=require("./fetchtext");
var getPhraseWidths=function (Q,phraseid,vposs) {
	var res=[];
	for (var i in vposs) {
		res.push(getPhraseWidth(Q,phraseid,vposs[i]));
	}
	return res;
}
var getPhraseWidth=function (Q,phraseid,vpos) {
	var P=Q.phrases[phraseid];
	var width=0,varwidth=false;
	if (P.width) return P.width; // no wildcard
	if (P.termid.length<2) return P.termlength[0];
	var lasttermposting=Q.terms[P.termid[P.termid.length-1]].posting;

	for (var i in P.termid) {
		var T=Q.terms[P.termid[i]];
		if (T.op=='wildcard') {
			width+=T.width;
			if (T.wildcard=='*') varwidth=true;
		} else {
			width+=P.termlength[i];
		}
	}
	if (varwidth) { //width might be smaller due to * wildcard
		var at=plist.indexOfSorted(lasttermposting,vpos);
		var endpos=lasttermposting[at];
		if (endpos-vpos<width) width=endpos-vpos+1;
	}

	return width;
}
/* return [vpos, phraseid, phrasewidth, optional_tagname] by slot range*/
var hitInRange=function(Q,startvpos,endvpos) {
	var res=[];
	if (!Q || !Q.rawresult || !Q.rawresult.length) return res;
	for (var i=0;i<Q.phrases.length;i++) {
		var P=Q.phrases[i];
		if (!P.posting) continue;
		var s=plist.indexOfSorted(P.posting,startvpos);
		var e=plist.indexOfSorted(P.posting,endvpos);
		//work around to include last item
		if (s===e&& e==P.posting.length-1) e++;
		var r=P.posting.slice(s,e);
		//console.log("s,e",s,e,"r",r)
		var width=getPhraseWidths(Q,i,r);

		res=res.concat(r.map(function(vpos,idx){ return [vpos,width[idx],i] }));
	}
	// order by vpos, if vpos is the same, larger width come first.
	// so the output will be
	// <tag1><tag2>one</tag2>two</tag1>
	//TODO, might cause overlap if same vpos and same width
	//need to check tag name
	res.sort(function(a,b){return a[0]==b[0]? b[1]-a[1] :a[0]-b[0]});

	return res;
}
var realHitInRange=function(Q,startvpos,endvpos,text){
}
var realHitInRange=function(Q,startvpos,endvpos,text){
	var hits=hitInRange(Q,startvpos,endvpos);
	return calculateRealPos(Q.tokenize,Q.isSkip,startvpos,text,hits);
}
var tagsInRange=function(Q,renderTags,startvpos,endvpos) {
	var res=[];
	if (typeof renderTags=="string") renderTags=[renderTags];

	renderTags.map(function(tag){
		var starts=Q.engine.get(["fields",tag+"_start"]);
		var ends=Q.engine.get(["fields",tag+"_end"]);
		if (!starts) return;

		var s=plist.indexOfSorted(starts,startvpos);
		var e=s;
		while (e<starts.length && starts[e]<endvpos) e++;
		var opentags=starts.slice(s,e);

		s=plist.indexOfSorted(ends,startvpos);
		e=s;
		while (e<ends.length && ends[e]<endvpos) e++;
		var closetags=ends.slice(s,e);

		opentags.map(function(start,idx) {
			res.push([start,closetags[idx]-start,tag]);
		})
	});
	// order by vpos, if vpos is the same, larger width come first.
	res.sort(function(a,b){return a[0]==b[0]? b[1]-a[1] :a[0]-b[0]});

	return res;
}

/*
given a vpos range start, file, convert to filestart, fileend
   filestart : starting file
   start   : vpos start
   showfile: how many files to display
   showpage: how many pages to display

output:
   array of fileid with hits
*/
var getFileWithHits=function(engine,Q,range) {
	var fileOffsets=engine.get("fileoffsets");
	var out=[],filecount=100;
	var start=0 , end=Q.byFile.length;
	Q.excerptOverflow=false;
	if (range.start) {
		var first=range.start ;
		var last=range.end;
		if (!last) last=Number.MAX_SAFE_INTEGER;
		for (var i=0;i<fileOffsets.length;i++) {
			//if (fileOffsets[i]>first) break;
			if (fileOffsets[i]>last) {
				end=i;
				break;
			}
			if (fileOffsets[i]<first) start=i;
		}		
	} else {
		start=range.filestart || 0;
		if (range.maxfile) {
			filecount=range.maxfile;
		} else if (range.showseg) {
			throw "not implement yet"
		}
	}

	var fileWithHits=[],totalhit=0;
	range.maxhit=range.maxhit||1000;

	for (var i=start;i<end;i++) {
		if(Q.byFile[i].length>0) {
			totalhit+=Q.byFile[i].length;
			fileWithHits.push(i);
			range.nextFileStart=i;
			if (fileWithHits.length>=filecount) {
				Q.excerptOverflow=true;
				break;
			}
			if (totalhit>range.maxhit) {
				Q.excerptOverflow=true;
				break;
			}
		}
	}
	if (i>=end) { //no more file
		Q.excerptStop=true;
	}
	return fileWithHits;
}

var calculateRealPos=function(_tokenize,_isSkip,vpos,text,hits) {
	var out=[];
	var tokenized=_tokenize(text);
	var tokens=tokenized.tokens;
	var offsets=tokenized.offsets;
	var i=0,j=0,end=0, hit;
	var hitstart=0,hitend=0,textnow=0;
	//console.log("text",text,'len',text.length,"hits",hits)

	while (i<tokens.length) {
		//console.log("textnow",textnow,"token",tokens[i],"vpos",vpos)
		if (vpos===end && out.length) {
			var len=textnow-out[out.length-1][0];
			out[out.length-1][1]=len;
		}

		var skip=_isSkip(tokens[i]);
		if (!skip && j<hits.length && vpos===hits[j][0]) {
			hit=[textnow, null];
			(typeof hits[j][2]!=="undefined") && hit.push(hits[j][2]);
			out.push( hit);//len will be resolve later
			end=vpos+hits[j][1];
			j++;
		}
		textnow+=tokens[i].length;
		if (!skip) vpos++;
		i++;
	}
	if (vpos===end && out.length) {
		var len=textnow-out[out.length-1][0];
		out[out.length-1][1]=textnow-out[out.length-1][0];
	}
	
	return out;
}
var resultlist=function(engine,Q,opts,cb) {
	var output=[];
	if (!Q.rawresult || !Q.rawresult.length) {
		cb(output);
		return;
	}
	if (opts.range) {
		if (opts.range.maxhit && !opts.range.maxfile) {
			opts.range.maxfile=opts.range.maxhit;
			opts.range.maxseg=opts.range.maxhit;
		}
		if (!opts.range.maxseg) opts.range.maxseg=100;
		if (!opts.range.end) {
			opts.range.end=Number.MAX_SAFE_INTEGER;
		}

		if (opts.range.from) {
			opts.range.start=engine.txtid2vpos(engine.nextTxtid(opts.range.from))+1;
		}
	}
	var fileWithHits=getFileWithHits(engine,Q,opts.range);
	if (!fileWithHits.length) {
		cb(output);
		return;
	}

	var output=[],files=[];//temporary holder for segnames
	for (var i=0;i<fileWithHits.length;i++) {
		var nfile=fileWithHits[i];
		var segoffsets=engine.getFileSegOffsets(nfile);
		//console.log("file",nfile,"segoffsets",segoffsets)
		var segnames=engine.getFileSegNames(nfile);
		files[nfile]={segoffsets:segoffsets};

		var segwithhit=plist.groupbyposting2(Q.byFile[ nfile ],  segoffsets);
		segwithhit.shift();
		//if (segoffsets[0]==1)
		//segwithhit.shift(); //the first item is not used (0~Q.byFile[0] )
		for (var j=0; j<segwithhit.length;j++) {
			var segoffset=segoffsets[j];
			if (!segwithhit[j].length) continue;
			//var offsets=segwithhit[j].map(function(p){return p- fileOffsets[i]});
			
			if (segoffset<opts.range.start) continue;
			if (segoffset>opts.range.end) break;

			output.push(  {file: nfile, seg:j,  segname:segnames[j]});
			if (output.length>=opts.range.maxseg) break;
		}
		if (output.length>=opts.range.maxseg) break;
	}
	var segpaths=output.map(function(p){
		return ["filecontents",p.file,p.seg];
	});
	//prepare the text
	engine.get(segpaths,function(segs){
		var seq=0;
		if (segs) for (var i=0;i<segs.length;i++) {
			var startvpos=files[output[i].file].segoffsets[output[i].seg];
			var endvpos=files[output[i].file].segoffsets[output[i].seg+1]||engine.get("meta").vsize;
			//console.log(startvpos,endvpos)
			var hl={};

			if (opts.nohighlight) {
				hl.text=segs[i];
				hl.hits=hitInRange(Q,startvpos,endvpos);
				hl.realHits=calculateRealPos(Q,startvpos,hl.text,hl.hits);
				//console.log("text",hl.text,"startvpos",startvpos,"endvpos",endvpos);
				//console.log("hits",hl.hits,"realhits",hl.realHits);
			} else {
				var o={nocrlf:true,nospan:true,
					text:segs[i],startvpos:startvpos, endvpos: endvpos, 
					Q:Q,fulltext:opts.fulltext};
				hl=highlight(Q,o);
			}
			if (hl.text) {
				output[i].text=hl.text;
				output[i].hits=hl.hits;
				output[i].realHits=hl.realHits;
				output[i].seq=seq;
				seq+=hl.hits.length;

				output[i].start=startvpos;				
			} else {
				output[i]=null; //remove item vpos less than opts.range.start
			}
		} 
		output=output.filter(function(o){return o!=null});
		cb(output);
	});
}
var injectTag=function(Q,opts){
	var hits=opts.hits;
	var tags=opts.tags;
	if (!tags) tags=[];
	var hitclass=opts.hitclass||'hl';
	var output='',O=[],j=0,k=0;
	var surround=opts.surround||5;

	var tokens=Q.tokenize(opts.text).tokens;
	var vpos=opts.vpos;
	var i=0,previnrange=!!opts.fulltext ,inrange=!!opts.fulltext;
	var hitstart=0,hitend=0,tagstart=0,tagend=0,tagclass="";
	while (i<tokens.length) {
		var skip=Q.isSkip(tokens[i]);
		var hashit=false;
		inrange=opts.fulltext || (j<hits.length && vpos+surround>=hits[j][0] ||
				(j>0 && j<=hits.length &&  hits[j-1][0]+surround*2>=vpos));	

		if (previnrange!=inrange) {
			output+=opts.abridge||"...";
		}
		previnrange=inrange;
		var token=tokens[i];
		if (opts.nocrlf && token=="\n") token="";

		if (inrange && i<tokens.length) {
			if (skip) {
				output+=token;
			} else {
				var classes="";	

				//check hit
				if (j<hits.length && vpos==hits[j][0]) {
					var nphrase=hits[j][2] % 10, width=hits[j][1];
					hitstart=hits[j][0];
					hitend=hitstart+width;
					j++;
				}

				//check tag
				if (k<tags.length && vpos==tags[k][0]) {
					var width=tags[k][1];
					tagstart=tags[k][0];
					tagend=tagstart+width;
					tagclass=tags[k][2];
					k++;
				}

				if (vpos>=hitstart && vpos<hitend) classes=hitclass+" "+hitclass+nphrase;
				if (vpos>=tagstart && vpos<tagend) classes+=" "+tagclass;

				if (classes || !opts.nospan) {
					output+='<span vpos="'+vpos+'"';
					if (classes) {
						classes+= (tagstart==vpos)?" "+tagclass+"-first":"";
						classes+= (tagend-1==vpos)?" "+tagclass+"-last":"";
						classes=' class="'+classes+'"';
					}
						
					output+=classes+'>';
					output+=token+'</span>';
				} else {
					output+=token;
				}
			}
		}
		if (!skip) vpos++;
		i++; 
	}

	O.push(output);
	output="";

	return O.join("");
}
var highlight=function(Q,opts) {
	if (!opts.text) return {text:"",hits:[]};
	var opt={text:opts.text,
		hits:null,abridge:opts.abridge,vpos:opts.startvpos,
		fulltext:opts.fulltext,renderTags:opts.renderTags,nospan:opts.nospan,nocrlf:opts.nocrlf,
	};

	opt.hits=hitInRange(opts.Q,opts.startvpos,opts.endvpos);
	return {text:injectTag(Q,opt),hits:opt.hits};
}

var addspan=function(text,startvpos){
	engine=this;
	var output="";
	var tokens=engine.analyzer.tokenize(text).tokens;
	var isSkip=engine.analyzer.isSkip;
	var vpos=startvpos;
	for (var i=0;i<tokens.length;i++) {
		output+='<span vpos="'+(vpos)+'">'+tokens[i]+"</span>";
		if (!isSkip(tokens[i])) vpos++;
	}		
	return output;
}
var addtoken=function(text,startvpos) {
	engine=this;
	var output=[];
	var tokens=engine.analyzer.tokenize(text).tokens;
	var isSkip=engine.analyzer.isSkip;
	var vpos=startvpos;
	for (var i=0;i<tokens.length;i++) {
		output.push([tokens[i],vpos]);
		if (!isSkip(tokens[i])) vpos++;
	}		
	return output;
}


var highlightFile=function(Q,fileid,opts,cb) {
	if (typeof opts=="function") {
		cb=opts;
	}

	if (!Q || !Q.engine) return cb(null);

	var segoffsets=Q.engine.getFileSegOffsets(fileid);
	var output=[];	
	//console.log(startvpos,endvpos)
	Q.engine.get(["filecontents",fileid],true,function(data){
		if (!data) {
			console.error("wrong file id",fileid);
		} else {
			for (var i=0;i<data.length-1;i++ ){
				var startvpos=segoffsets[i];
				var endvpos=segoffsets[i+1];
				var segnames=Q.engine.getFileSegNames(fileid);
				var seg=fetchtext.segSync(Q.engine, fileid,i+1);
				var opt={text:seg.text,hits:null,tag:'hl',vpos:startvpos,
					fulltext:true,nospan:opts.nospan,nocrlf:opts.nocrlf};
				var segname=segnames[i+1];
				opt.hits=hitInRange(Q,startvpos,endvpos);
				var pb='<pb n="'+segname+'"></pb>';
				var withtag=injectTag(Q,opt);
				output.push(pb+withtag);
			}			
		}

		cb.apply(Q.engine.context,[{text:output.join(""),file:fileid}]);
	})
}
var highlightSeg=function(Q,fileid,segid,opts,cb,context) {
	if (typeof opts=="function") {
		cb=opts;
	}

	if (!Q || !Q.engine) return cb.apply(context,[null]);
	var segoffsets=Q.engine.getFileSegOffsets(fileid);
	var startvpos=segoffsets[segid];
	var endvpos=segoffsets[segid+1];
	var segnames=Q.engine.getFileSegNames(fileid);

	fetchtext.seg(Q.engine,fileid,segid,function(res){
		var opt={text:res.text,hits:null,vpos:startvpos,fulltext:true,
			nospan:opts.nospan,nocrlf:opts.nocrlf};
			opt.hits=hitInRange(Q,startvpos,endvpos);
			if (opts.renderTags) {
				opt.tags=tagsInRange(Q,opts.renderTags,startvpos,endvpos);
			}

		var segname=segnames[segid];
		cb.apply(context||Q.engine.context,[{text:injectTag(Q,opt),rawtext:res.text,
			tags:opt.tags,seg:segid,file:fileid,hits:opt.hits,segname:segname}]);
	});
}

var highlightRange=function(Q,start,end,opts,cb,context){
	fetchtext.range.call(Q.engine,start,end,function(text){
		var opt={text:text,fulltext:true,nospan:true};
		opt.hits=hitInRange(Q,start,end);

		if (opts.renderTags) {
			opt.tags=tagsInRange(Q,opts.renderTags,start,end);
		}
		opt.vpos=start-1; //getPageRange +1 , 
		var highlighted=injectTag(Q,opt);
		//console.log(highlighted)
		cb.apply(context||Q.engine.context,[{text:highlighted,rawtext:text,tags:opt.tags,hits:opt.hits}]);
	})
}


module.exports={resultlist:resultlist, 
	hitInRange:hitInRange, 
	realHitInRange:realHitInRange, 
	highlightSeg:highlightSeg,
	highlightFile:highlightFile,
	highlightRange:highlightRange,
	calculateRealPos:calculateRealPos
};