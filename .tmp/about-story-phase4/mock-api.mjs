import http from 'node:http';

const chapterKeys = ['opening','milestones','stories','people','future'];
const titles = ['Hành trình tạo dựng niềm tin','Những cột mốc đáng nhớ','Những câu chuyện đồng hành','Con người Toàn Trung','Chặng đường phía trước'];
const hero = {id:'hero-test',url:'https://cdn.toantrungxeluot.io.vn/website-static/ea9236a66bd8731eff71456b3663688d059e8a35eca1b31bdb38dfe544aa0f27.jpg',width:1600,height:1200,alt:'Showroom Toàn Trung tại Quốc lộ 13',placement:'desktop'};
const chapters = chapterKeys.map((key,index)=>({key,title:titles[index],subtitle:index===0?'Không ngừng phát triển từ những giá trị được gìn giữ qua từng chặng đường.':null,body:index===0?'Nội dung minh họa để kiểm tra bố cục. Bản này chỉ dùng trong thử nghiệm local.':index===3?'Thông tin đội ngũ thực tế sẽ được quản trị viên bổ sung sau khi xác minh.':null,ctaLabel:index===4?'Khám phá xe':null,ctaHref:index===4?'/san-pham':null,images:index===0?[hero]:index===3?[{...hero,id:'people-image',placement:'gallery'}]:index===4?[{...hero,id:'future-image'}]:[]}));
const stages = ['1997-2017','2018-2022','2024-2025','2026'];
const labels = ['1997','2010','2011','2017','2018–2019','2020–2021','01/11/2021','2022','09–10/2024','2024–2025','2025','06/2026'];
const milestones = labels.map((periodLabel,index)=>({id:`m${index}`,slug:`mock-${index}`,periodLabel,eventDate:null,stage:stages[index<4?0:index<8?1:index<11?2:3],title:`Cột mốc minh họa ${index+1}`,summary:'Dữ liệu kiểm thử giao diện; không phải nội dung được công bố.',body:null,featured:index%3===0,images:index===0?[hero]:[]}));
const stories = [1,2,3].map(index=>({id:`s${index}`,title:`Câu chuyện minh họa ${index}`,body:'Nội dung kiểm thử local; không phải đánh giá khách hàng được công bố.',quote:null,displayName:null,images:[{...hero,id:`story-image-${index}`,placement:'gallery'}]}));
const payload = JSON.stringify({chapters,milestones,stories,publishedAt:'2026-10-22T00:00:00Z',revision:1});
const server = http.createServer((request,response)=>{
  const path = new URL(request.url||'/', 'http://127.0.0.1').pathname;
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('Cache-Control','no-store');
  if(path==='/api/v1/about-story') {
    if(process.env.MOCK_ABOUT_UNPUBLISHED==='1'){response.statusCode=404;return response.end('{}');}
    return response.end(payload);
  }
  if(path==='/api/v1/seo'){response.statusCode=404;return response.end('{}');}
  if(path.startsWith('/api/v1/lookups/'))return response.end(JSON.stringify({data:[],meta:{page:1,limit:100,total:0,totalPages:1}}));
  return response.end('[]');
});
server.listen(4109,'127.0.0.1',()=>console.log('mock API on 4109'));
