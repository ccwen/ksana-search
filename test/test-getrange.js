var kse=require("../index");
/*
kse.highlightRange("yijing",{start:1100,end:1106},function(data){
		console.log(data);
});
*/
kse.highlightPage("yijing",{id:"2",q:"君子"},function(data){
	console.log(data);
})