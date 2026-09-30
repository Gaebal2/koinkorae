export function cropGeometry(width,height,aspect,zoom=1,x=50,y=50,maxSide=960) {
  const ratio=aspect||width/height;
  const cropWidth=Math.min(width,height*ratio)/Math.max(1,zoom),cropHeight=cropWidth/ratio;
  const scale=Math.min(1,maxSide/Math.max(cropWidth,cropHeight));
  return {sx:(width-cropWidth)*Math.max(0,Math.min(100,x))/100,sy:(height-cropHeight)*Math.max(0,Math.min(100,y))/100,
    sw:cropWidth,sh:cropHeight,width:Math.max(1,Math.round(cropWidth*scale)),height:Math.max(1,Math.round(cropHeight*scale))};
}
export function validatePhotoFile(file) {
  if(!file)return;
  if(file.size>20*1024*1024 || !/^image\/(png|jpeg|webp|avif|heic|heif)$/i.test(file.type))throw Error('20MB 이하의 사진을 선택해 주세요.');
}
