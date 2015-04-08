//
// Ksana Search Engine.

//  need a KDE instance to be functional

var bsearch=require("./bsearch");
var dosearch=require("./search");

var prepareEngineForSearch=function(engine,cb){
	if (engine.get("tokens") && engine.tokenizer) {
		cb();
		return;
	}

	engine.get([["tokens"],["postingslength"]],function(){
		if (!engine.analyzer) {
			var analyzer=require("ksana-analyzer");
			var config=engine.get("meta").config;
			engine.analyzer=analyzer.getAPI(config);			
		}
		cb();
	});
}

var _search=function(engine,q,opts,cb,context) {
	if (typeof engine=="string") {//browser only
		var kde=require("ksana-database");
		if (typeof opts=="function") { //user didn't supply options
			if (typeof cb=="object")context=cb;
			cb=opts;
			opts={};
		}
		opts.q=q;
		opts.dbid=engine;
		kde.open(opts.dbid,function(err,db){
			if (err) {
				cb(err);
				return;
			}
			prepareEngineForSearch(db,function(){
				return dosearch(db,q,opts,cb);	
			});
		},context);
	} else {
		prepareEngineForSearch(engine,function(){
			return dosearch(engine,q,opts,cb);	
		});
	}
}


var _highlightSeg=function(engine,fileid,segid,opts,cb,context){
	if (!opts.q) {
		if (!engine.analyzer) {
			var analyzer=require("ksana-analyzer");
			var config=engine.get("meta").config;
			engine.analyzer=analyzer.getAPI(config);			
		}
		api.excerpt.getSeg(engine,fileid,segid,opts,cb,context);
	} else {
		_search(engine,opts.q,opts,function(err,Q){
			api.excerpt.highlightSeg(Q,fileid,segid,opts,cb,context);
		});			
	}
}
var _highlightRange=function(engine,start,end,opts,cb,context){

	if (opts.q) {
		_search(engine,opts.q,opts,function(err,Q){
			api.excerpt.highlightRange(Q,start,end,opts,cb,context);
		});
	} else {
		prepareEngineForSearch(engine,function(){
			api.excerpt.getRange(engine,start,end,cb,context);
		});
	}
}
var _highlightFile=function(engine,fileid,opts,cb){
	if (!opts.q) opts.q=""; 
	_search(engine,opts.q,opts,function(err,Q){
		api.excerpt.highlightFile(Q,fileid,opts,cb);
	});
}
var api={
	search:_search
	//,highlightSeg:_highlightSeg
	//,highlightFile:_highlightFile
	//,excerpt:require("./excerpt")
}
module.exports=api;