/* ==========================================================================
 *  我的读书库 · 数据文件
 *  --------------------------------------------------------------------------
 *  新增一本书的三种方式：
 *      1) 命令行  python3 scripts/add_book.py --title "书名" --author "作者"
 *      2) 交互式  python3 scripts/add_book.py
 *      3) 批量    python3 scripts/add_book.py --csv books.csv
 *
 *  字段速查（只有 title 必填，其余都可省略）：
 *      id          唯一标识，留空自动生成；用于网页锚点  #id
 *      title       书名          author      作者
 *      translator  译者          publisher   出版社      year   出版年
 *      category    分类，如 历史 / 文学 / 社科 / 经典
 *      tags        标签 ["唐史", "人物传记"]
 *      status      wish 想读 / reading 在读 / done 已读
 *      progress    进度 0-100（在读时显示进度条）
 *      rating      评分 0-5（0 = 未评分）
 *      startedAt   起读日期 YYYY-MM-DD
 *      finishedAt  读完日期 YYYY-MM-DD
 *      cover       封面：本地路径或网址，留空自动生成
 *      summary     一句话简介
 *      notes       读书笔记，支持 \n 换行
 *      quotes      摘句 ["句子一", "句子二"]
 *      link        原书链接（豆瓣 / 微信读书）
 *
 *  提示：本文件由脚本维护，数组内的注释会在下次整理时被清除，
 *        要写备注就写在上面这段里。
 *
 *  封面 cover 字段：
 *      - 填本地路径：images/xxx.jpg（图片放仓库的 images/ 目录，一起提交）
 *      - 填网络地址：https://...
 *      - 留空 ""：页面会自动生成一张渐变色书封（不会出现裂图）
 * ========================================================================== */

window.BOOKS = [
  {
    "id": "wuzetian-mengman",
    "title": "武则天",
    "author": "蒙曼",
    "publisher": "广西师范大学出版社",
    "year": 2015,
    "category": "历史",
    "tags": ["唐史", "人物传记"],
    "status": "reading",
    "progress": 21,
    "startedAt": "2025-05-01",
    "summary": "从才人到女皇，蒙曼讲武则天的权力之路与时代底色。",
    "notes": "读到第 36 章。\n注意作者对「关陇集团」与「科举新贵」这条线索的铺排。",
    "quotes": ["她最大的本事，是让所有人低估她。"]
  },
  {
    "id": "suitang-chenyinke",
    "title": "隋唐制度渊源略论稿 唐代政治史述论稿",
    "author": "陈寅恪",
    "publisher": "商务印书馆",
    "year": 2011,
    "category": "历史",
    "tags": ["唐史", "制度史", "学术经典"],
    "status": "done",
    "progress": 100,
    "rating": 5,
    "startedAt": "2026-01-10",
    "finishedAt": "2026-04-05",
    "summary": "隋唐制度三源说与唐代政治集团分析，二十世纪中国史学的奠基之作。",
    "notes": "「关中本位政策」一节的论证方法值得反复揣摩。",
    "quotes": ["华夏民族之文化，历数千载之演进，造极于赵宋之世。", "治国者，必先正其制度；制度不正，虽有贤才亦无所施。"]
  },
  {
    "id": "sample-hongloumeng",
    "title": "红楼梦",
    "cover": "images/sample-hongloumeng.jpg",
    "author": "曹雪芹",
    "publisher": "人民文学出版社",
    "year": 1996,
    "category": "文学",
    "tags": ["古典小说", "常读常新"],
    "status": "done",
    "progress": 100,
    "rating": 5,
    "startedAt": "2024-11-02",
    "finishedAt": "2025-02-18",
    "summary": "一座大观园，写尽盛衰与人情。",
    "quotes": ["世事洞明皆学问，人情练达即文章。"]
  },
  {
    "id": "sample-sapiens",
    "title": "人类简史",
    "author": "尤瓦尔·赫拉利",
    "translator": "林俊宏",
    "publisher": "中信出版社",
    "year": 2014,
    "category": "社科",
    "tags": ["人类学", "认知革命"],
    "status": "done",
    "progress": 100,
    "rating": 4,
    "startedAt": "2025-06-01",
    "finishedAt": "2025-07-12",
    "summary": "从认知革命到科学革命，重新讲述人类的七万年。",
    "notes": "第三部分关于「想象的秩序」最有启发。"
  },
  {
    "id": "sample-thinking-fast-slow",
    "title": "思考，快与慢",
    "author": "丹尼尔·卡尼曼",
    "translator": "胡晓姣 等",
    "publisher": "中信出版社",
    "year": 2012,
    "category": "社科",
    "tags": ["心理学", "决策"],
    "status": "reading",
    "progress": 45,
    "startedAt": "2026-08-01",
    "summary": "系统 1 与系统 2，人类判断的两套机制。"
  },
  {
    "id": "sample-yuanqu",
    "title": "元曲选",
    "author": "臧懋循 编",
    "publisher": "中华书局",
    "year": 1958,
    "category": "文学",
    "tags": ["古典戏曲", "诗词曲"],
    "status": "wish",
    "summary": "想系统读一遍散曲与杂剧。"
  },
   {
    "id": "sample-yuanqu",
    "title": "元曲选",
    "author": "臧懋循 编",
    "publisher": "中华书局",
    "year": 1958,
    "category": "文学",
    "tags": ["古典戏曲", "诗词曲"],
    "status": "wish",
    "summary": "想系统读一遍散曲与杂剧。"
  },
  {
    "id": "sunzibingfa",
    "title": "孙子兵法",
    "author": "孙子",
    "publisher": "中华书局",
    "year": 2011,
    "category": "经典",
    "tags": ["四书", "常读常新"],
    "status": "done",
    "cover": "images/孙子兵法.jpg",
    "summary": "认识经典"
  }
];
