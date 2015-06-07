//
// Ksana Search Engine.

//  need a KDE instance to be functional

var bsearch=require("./bsearch");
var dosearch=require("./search");

var prepareEngineForSearch=function(engine,cb){
	if (engine.get("tokens") && engine.analyzer) {
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

var openEngine=function(dbid_or_engine,cb,context) {
	if (typeof dbid_or_engine=="string") {//browser only
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
		return dosearch(engine,q,opts,cb);
	});
}
var fetchtext=require("./fetchtext");
var _highlightSeg=function(engine,fileid,segid,opts,cb,context){
	openEngine(engine,function(engine){
		if (!opts.q) {
			if (!engine.analyzer) {
				var analyzer=require("ksana-analyzer");
				var config=engine.get("meta").config;
				engine.analyzer=analyzer.getAPI(config);			
			}
			fetchtext.seg(engine,fileid,segid,opts,cb,context);
		} else {
			_search(engine,opts.q,opts,function(err,Q){
				api.excerpt.highlightSeg(Q,fileid,segid,opts,cb,context);
			});			
		}		
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

var api={
	search:_search
	,highlightSeg:_highlightSeg
	,highlightFile:_highlightFile
	,highlightPage:_highlightPage
	,highlightRange:_highlightRange
	,searchInTag:_searchInTag
	,excerpt:require("./excerpt")	
}
module.exports=api;