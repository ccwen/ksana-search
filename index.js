//
// Ksana Search Engine.

//  need a KDE instance to be functional

var mainsearch=require("./search");
var _excerpt=require("./excerpt")	;
var prepareEngineForSearch=function(engine,cb){
	var t=new Date();
	engine.get([["tokens"],["postingslength"],["search"]],{recursive:true},function(){
		if (!engine.timing.gettokens) engine.timing.gettokens=new Date()-t;
			var meta=engine.get("meta");
			var normalize=engine.get(["search","normalize"]);
			if (normalize && engine.analyzer.setNormalizeTable) {
				//normalized object will be combined in analyzer
				meta.normalizeObj=engine.analyzer.setNormalizeTable(normalize,meta.normalizeObj);
			}
		cb();
	});
}

var openEngine=function(dbid_or_engine,cb,context) {
	var localfile=(typeof File!=="undefined" && dbid_or_engine.constructor==File);
	if (typeof dbid_or_engine=="string" || localfile) {//browser only
		var kde=require("ksana-database");

		kde.open(dbid_or_engine,function(err,engine){

			if (!err) {
				prepareEngineForSearch(engine,function(){
					cb.call(context,engine);
				});
			} else throw err;
		});
	} else {
		prepareEngineForSearch(dbid_or_engine,function(){
			cb.call(context,dbid_or_engine);
		});
	}
}
var _search=function(engine,q,opts,cb,context) {

	openEngine(engine,function(engine){

		if (typeof opts=="function") { //user didn't supply options
			if (typeof cb=="object")context=cb;
			cb=opts;
			opts={};
		}
		if (!opts) opts={};
		opts.q=q;
		opts.dbid=engine;
		return mainsearch(engine,q,opts,cb);
	});
}
var fetchtext=require("./fetchtext");
var _highlightSeg=function(engine,fileid,segid,opts,cb,context){
	openEngine(engine,function(engine){
		/*
		if (!opts.q) {
			if (!engine.analyzer) {
				var analyzer=require("ksana-analyzer");
				var config=engine.get("meta").config;
				engine.analyzer=analyzer.getAPI(config);			
			}
			fetchtext.seg(engine,fileid,segid,opts,cb,context);
		} else {
		*/
			_search(engine,opts.q,opts,function(err,Q){
				api.excerpt.highlightSeg(Q,fileid,segid,opts,cb,context);
			});			
		//}		
	});
}


var _highlightRange=function(engine,opts,cb,context){
	openEngine(engine,function(engine){
		if (opts.q) {
			_search(engine,opts.q,opts,function(err,Q){
				api.excerpt.highlightRange(Q,opts.start,opts.end,opts,cb,context);
			});
		} else {
			fetchtext.range.call(engine,opts.start,opts.end,cb,context);
		}		
	})
}

var _highlightPage=function(_engine,opts,cb,context){
	openEngine(_engine,function(engine){
		fetchtext.pageRange(engine,opts.id,function(res){
			if (!res) {
				console.error("error page",opts.page)
				return;
			}
			if (opts.q) {
				_search(engine,opts.q,opts,function(err,Q){
					api.excerpt.highlightRange(Q,res.start,res.end,opts,cb,context);
				});
			} else {
				fetchtext.range.call(engine,res.start,res.end,cb,context);
			}					
		})
	})
}

var _highlightFile=function(engine,fileid,opts,cb,context){
	openEngine(engine,function(engine){
		if (!opts.q) opts.q=""; 
		_search(engine,opts.q,opts,function(err,Q){
			api.excerpt.highlightFile(Q,fileid,opts,cb,context);
		});		
	})
}

var _searchInTag=function(engine,opts,cb,context){

}

//similar to calculateRealPos, for converting markup
var vpos2pos=function(db, textvpos , text, vpos_end ) {
	var tokenize=db.analyzer.tokenize;
	var isSkip=db.analyzer.isSkip;
	return _excerpt.calculateRealPos(tokenize,isSkip,textvpos,text,vpos_end);
}


var api={
	search:_search
	,highlightSeg:_highlightSeg
	,highlightFile:_highlightFile
	,highlightPage:_highlightPage
	,highlightRange:_highlightRange
	,searchInTag:_searchInTag
	,excerpt:_excerpt
	,vpos2pos:vpos2pos
	,open:openEngine
	,_search:mainsearch//for testing only
}
module.exports=api;