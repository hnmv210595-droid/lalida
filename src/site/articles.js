// Bài viết SEO (từ khoá chính: cơm gà Tam Kỳ, cơm gà LaLiDa). Thêm bài mới: thêm một phần tử vào mảng -
// trang /bai-viet, /bai-viet/<slug> và sitemap.xml tự cập nhật.
export const ARTICLES = [
  {
    slug: 'com-ga-tam-ky-dac-san-xu-quang',
    title: 'Cơm gà Tam Kỳ – đặc sản xứ Quảng và bí quyết làm nên hương vị',
    description:
      'Cơm gà Tam Kỳ có gì đặc biệt? Tìm hiểu gà ta, cơm vàng nấu nước luộc gà, gỏi gà rau răm và tương ớt – những thứ làm nên đặc sản cơm gà Tam Kỳ, Quảng Nam.',
    keywords: 'cơm gà Tam Kỳ, đặc sản Quảng Nam, cơm gà xứ Quảng, gà ta, cơm gà ngon',
    date: '2026-10-27',
    minutes: 5,
    excerpt:
      'Từ món ăn dân dã của người Tam Kỳ, cơm gà đã thành đặc sản xứ Quảng. Gà ta, cơm vàng, gỏi gà và tương ớt – mỗi thứ đều có bí quyết riêng.',
    html: `
<p>Nhắc tới ẩm thực Quảng Nam, bên cạnh mì Quảng hay cao lầu, <strong>cơm gà Tam Kỳ</strong> là cái tên khiến nhiều thực khách nhớ mãi. Từ món ăn quen thuộc trong bữa cơm của người dân phố thị Tam Kỳ, cơm gà đã trở thành đặc sản được tìm kiếm ở khắp nơi. Vậy điều gì làm nên một đĩa cơm gà Tam Kỳ đúng vị?</p>

<h2>Cơm gà Tam Kỳ có gì đặc biệt?</h2>
<p>Một đĩa cơm gà Tam Kỳ ngon là sự kết hợp hài hoà của bốn thành phần: <strong>gà ta</strong>, <strong>cơm vàng</strong>, <strong>gỏi gà</strong> và <strong>nước chấm</strong>. Mỗi thứ đều được chăm chút riêng, để khi ăn cùng nhau tạo nên vị ngọt, béo, thơm và cay nhẹ rất đặc trưng của xứ Quảng.</p>

<h2>1. Gà ta – linh hồn của món ăn</h2>
<p>Cơm gà Tam Kỳ truyền thống dùng <strong>gà ta thả vườn</strong>: thịt săn chắc, da mỏng, mỡ vàng và ngọt tự nhiên. Gà được luộc vừa chín tới để thịt không bở, da không nứt; sau đó xé phay theo thớ hoặc chặt miếng tuỳ khẩu vị khách.</p>
<p>Người sành ăn thường đánh giá một quán cơm gà trước hết qua miếng thịt: ngọt, dai vừa phải, không có mùi hôi và không bị khô. Đó là lý do các quán cơm gà ngon luôn khắt khe trong khâu chọn gà.</p>

<h2>2. Cơm vàng óng, tơi hạt</h2>
<p>Cơm được nấu từ gạo ngon bằng <strong>nước luộc gà</strong>, thêm chút mỡ gà và nghệ nên hạt cơm vàng ươm, thơm mùi gà. Hạt cơm phải tơi, không nhão, không khô – ăn không cũng đã thấy đậm đà. Nồi cơm ngon hay dở phụ thuộc nhiều vào kinh nghiệm của người nấu: lượng nước, độ lửa và thời gian ủ.</p>

<h2>3. Gỏi gà, rau răm và đồ chua</h2>
<p>Thịt gà xé được trộn với hành tây thái mỏng, rau răm, muối tiêu và chút chanh thành món gỏi gà chua cay, thanh mát. Ăn kèm là đu đủ hoặc dưa ngâm chua giòn giòn, giúp cân bằng vị béo của gà và cơm.</p>

<h2>4. Tương ớt và nước chấm</h2>
<p>Đĩa cơm gà Tam Kỳ không thể thiếu chén <strong>tương ớt</strong> hoặc nước mắm gừng ớt. Vị cay nồng đặc trưng của ớt xứ Quảng làm miếng gà thêm đậm đà và khiến bữa ăn "bắt cơm" hơn.</p>

<h2>5. Chén canh nóng</h2>
<p>Đi kèm thường là chén canh nấu từ nước luộc gà, có thể thêm lòng mề, rau thơm. Một chén canh nóng, trong và ngọt giúp bữa cơm gà trọn vẹn hơn, nhất là vào những ngày trời se lạnh.</p>

<h2>Cơm gà Tam Kỳ và cơm gà Hội An khác nhau thế nào?</h2>
<p>Cả hai đều là đặc sản của Quảng Nam nên nhiều người hay nhầm lẫn. Mỗi nơi, mỗi quán có cách làm riêng, nhưng điểm thường được nhắc tới ở cơm gà Tam Kỳ là sự đề cao <strong>chất lượng gà ta</strong>: khách có thể chọn phần gà mình thích (đùi, cánh, ức…), ăn cùng cơm vàng nấu nước luộc gà, gỏi gà và tương ớt. Cách tốt nhất để cảm nhận sự khác biệt là… thử cả hai!</p>

<h2>Thưởng thức cơm gà Tam Kỳ tại LaLiDa</h2>
<p>Tại <strong>LaLiDa – Gà ba nuôi, Cơm mẹ nấu</strong>, chúng tôi nấu cơm gà theo đúng tinh thần đó: gà nhà nuôi, cơm nấu bằng nước luộc gà, gỏi và tương ớt làm mỗi ngày. Bạn có thể đọc thêm câu chuyện của quán trong bài <a href="/bai-viet/com-ga-lalida-ga-ba-nuoi-com-me-nau">Cơm gà LaLiDa – Gà ba nuôi, Cơm mẹ nấu</a>, hoặc <a href="/online">xem thực đơn và đặt món online</a> ngay.</p>
`,
  },
  {
    slug: 'com-ga-lalida-ga-ba-nuoi-com-me-nau',
    title: 'Cơm gà LaLiDa – Gà ba nuôi, Cơm mẹ nấu: cơm gà Tam Kỳ đậm vị gia đình',
    description:
      'Câu chuyện quán cơm gà LaLiDa: gà ba nuôi, cơm mẹ nấu theo phong cách cơm gà Tam Kỳ. Thực đơn, cách gọi món bằng mã QR và đặt cơm gà online tại lalida.net.',
    keywords: 'cơm gà LaLiDa, LaLiDa, quán cơm gà, cơm gà Tam Kỳ, đặt cơm gà online',
    date: '2026-10-27',
    minutes: 4,
    excerpt:
      'LaLiDa là quán cơm gà gia đình với slogan "Gà ba nuôi – Cơm mẹ nấu". Câu chuyện, thực đơn và cách gọi món nhanh bằng mã QR hoặc đặt online.',
    html: `
<p>"<strong>Gà ba nuôi – Cơm mẹ nấu</strong>" không chỉ là khẩu hiệu, đó là cách <strong>LaLiDa</strong> nấu từng đĩa cơm gà mỗi ngày. Chúng tôi muốn mỗi thực khách khi ghé quán đều có cảm giác như đang ngồi ăn bữa cơm nhà – giản dị, no đủ và ấm áp.</p>

<h2>Câu chuyện phía sau cái tên LaLiDa</h2>
<p>Hình ảnh trên logo của quán là cả một gia đình: người ba ôm chú gà ta, người mẹ bưng chén cơm nóng và người con cầm vá phụ bếp. Đó cũng chính là cách quán vận hành – mỗi người một việc, cùng nhau làm nên món <strong>cơm gà Tam Kỳ</strong> mà gia đình đã ăn từ bao năm nay.</p>
<ul>
  <li><strong>Gà ba nuôi:</strong> gà ta được chăm kỹ để thịt săn, da giòn, ngọt tự nhiên.</li>
  <li><strong>Cơm mẹ nấu:</strong> cơm nấu bằng nước luộc gà, vàng thơm, tơi hạt như cơm nhà.</li>
  <li><strong>Đồ ăn kèm làm mỗi ngày:</strong> gỏi gà rau răm, đồ chua, tương ớt và chén canh nóng.</li>
</ul>

<h2>Thực đơn cơm gà LaLiDa có gì?</h2>
<p>Thực đơn của LaLiDa được chia thành các nhóm dễ chọn:</p>
<ul>
  <li><strong>Cơm:</strong> các phần cơm gà với gà xé, đùi gà… ăn kèm gỏi và canh.</li>
  <li><strong>Đồ ăn:</strong> các món gà và món ăn kèm cho bữa ăn thêm đầy đặn.</li>
  <li><strong>Canh:</strong> canh nóng nấu từ nước luộc gà.</li>
  <li><strong>Đồ uống:</strong> nước giải khát mát lạnh.</li>
  <li><strong>Gọi thêm:</strong> thêm cơm, thêm gà, thêm trứng… cho những ai ăn "khoẻ".</li>
</ul>
<p>Giá và món đang có được cập nhật trực tiếp trên <a href="/online">trang thực đơn</a>; món nào tạm hết sẽ hiện "Đã bán hết" để bạn không phải chờ.</p>

<h2>Gọi món nhanh bằng mã QR tại bàn</h2>
<p>Mỗi bàn tại LaLiDa đều có mã QR riêng. Bạn chỉ cần quét mã bằng camera điện thoại, chọn món và bấm <strong>Đặt đơn</strong> – món sẽ được chuyển thẳng xuống bếp. Bạn có thể xem trạng thái từng món và sửa đơn khi món chưa được làm. Nhiều nhóm khách ngồi chung bàn vẫn có thể gọi đơn riêng.</p>

<h2>Đặt cơm gà online</h2>
<p>Không tiện ghé quán? Hãy vào <a href="/online">lalida.net/online</a>, chọn món, điền <strong>tên, số điện thoại và địa chỉ</strong> rồi bấm đặt. Quán sẽ liên hệ xác nhận và chuẩn bị món cho bạn.</p>

<h2>Góp ý – nhận ngay 1 ly nước cho lần sau</h2>
<p>LaLiDa luôn muốn lắng nghe. Sau bữa ăn, bạn chỉ cần gửi góp ý trong mục <strong>Góp ý &amp; Phản hồi</strong> trên trang gọi món để nhận mã tặng <strong>1 ly nước</strong> cho hoá đơn lần sau. Chi tiết xem tại <a href="/dieu-khoan">Điều khoản &amp; điều kiện</a>.</p>

<p>Muốn biết thêm về món cơm gà xứ Quảng? Đọc bài <a href="/bai-viet/com-ga-tam-ky-dac-san-xu-quang">Cơm gà Tam Kỳ – đặc sản xứ Quảng</a> hoặc <a href="/bai-viet/cach-an-com-ga-tam-ky-ngon-dung-dieu">Cách ăn cơm gà Tam Kỳ đúng điệu</a>.</p>
`,
  },
  {
    slug: 'cach-an-com-ga-tam-ky-ngon-dung-dieu',
    title: 'Cách ăn cơm gà Tam Kỳ đúng điệu và 6 mẹo chọn quán cơm gà ngon',
    description:
      'Ăn cơm gà Tam Kỳ thế nào cho đúng điệu? Hướng dẫn cách ăn, chọn phần gà, trộn gỏi, chấm tương ớt và 6 mẹo nhận biết quán cơm gà Tam Kỳ ngon.',
    keywords: 'cách ăn cơm gà Tam Kỳ, quán cơm gà ngon, cơm gà Tam Kỳ ngon, mẹo chọn quán cơm gà',
    date: '2026-10-27',
    minutes: 5,
    excerpt:
      'Chọn đùi hay ức, trộn gỏi thế nào, chấm tương ớt ra sao? Cùng 6 mẹo nhỏ để nhận ra một quán cơm gà Tam Kỳ thật sự ngon.',
    html: `
<p>Cơm gà Tam Kỳ ngon nhất khi được ăn "đúng điệu" – nghĩa là biết cách kết hợp gà, cơm, gỏi, tương ớt và canh. Dưới đây là cách ăn mà người Quảng hay dùng, cùng vài mẹo để bạn chọn được một quán <strong>cơm gà Tam Kỳ ngon</strong>.</p>

<h2>Cách ăn cơm gà Tam Kỳ đúng điệu</h2>
<h3>1. Chọn phần gà bạn thích</h3>
<p>Gà xé phù hợp với người thích ăn nhanh, gọn và trộn cùng gỏi. Đùi và má đùi nhiều thịt, da giòn, đậm vị – được nhiều người yêu thích nhất. Ức gà ít mỡ, hợp với người ăn thanh đạm. Đừng ngại hỏi quán phần nào đang ngon nhất trong ngày.</p>

<h3>2. Nếm cơm trước</h3>
<p>Hãy ăn thử một muỗng cơm không. Cơm gà Tam Kỳ nấu bằng nước luộc gà nên tự nó đã thơm và đậm vị – đây là cách nhanh nhất để cảm nhận tay nghề của người nấu.</p>

<h3>3. Trộn gỏi cùng cơm</h3>
<p>Gắp một ít gỏi gà (hành tây, rau răm) và đồ chua lên cơm. Vị chua nhẹ, the mát của rau răm làm bữa ăn không bị ngấy dù ăn nhiều.</p>

<h3>4. Chấm tương ớt "vừa đủ cay"</h3>
<p>Tương ớt xứ Quảng khá cay. Hãy chấm từng chút một vào miếng gà thay vì rưới trực tiếp lên cơm, để giữ được vị ngọt của thịt gà.</p>

<h3>5. Kết thúc với chén canh nóng</h3>
<p>Húp chén canh gà nóng giữa hoặc cuối bữa giúp "trôi" cơm và làm ấm bụng – một phần không thể thiếu của bữa cơm gà.</p>

<h2>6 mẹo chọn quán cơm gà Tam Kỳ ngon</h2>
<ol>
  <li><strong>Gà ta, da vàng mỏng:</strong> thịt săn, ngọt, không bở; da mỏng màu vàng tự nhiên.</li>
  <li><strong>Cơm tơi, vàng, thơm mùi gà:</strong> hạt cơm không nhão, không khô và không bị nhuộm màu quá đậm.</li>
  <li><strong>Gỏi và rau tươi:</strong> hành tây giòn, rau răm xanh, đồ chua làm trong ngày.</li>
  <li><strong>Canh trong, ngọt:</strong> nước dùng trong, ngọt vị gà, không quá nhiều bột ngọt.</li>
  <li><strong>Tương ớt tự làm:</strong> thơm, cay nồng – dấu hiệu quán chịu khó trong từng chi tiết.</li>
  <li><strong>Sạch sẽ và giá rõ ràng:</strong> thực đơn có giá niêm yết, quán gọn gàng, phục vụ nhanh.</li>
</ol>

<h2>Gọi thêm gì khi ăn cơm gà?</h2>
<p>Nếu đi nhóm, bạn có thể gọi thêm một đĩa gà, phần lòng mề hoặc thêm cơm để ăn chung. Một ly nước mát cũng giúp bữa ăn trọn vị hơn – và ở LaLiDa, khách gửi góp ý sau bữa ăn sẽ được <strong>tặng 1 ly nước cho lần sau</strong>.</p>

<h2>Thử ngay cơm gà LaLiDa</h2>
<p>Tất cả những tiêu chí trên chính là điều <strong>LaLiDa</strong> theo đuổi với tinh thần "Gà ba nuôi – Cơm mẹ nấu". <a href="/online">Xem thực đơn và đặt món online</a>, hoặc tìm hiểu thêm về <a href="/bai-viet/com-ga-tam-ky-dac-san-xu-quang">nguồn gốc cơm gà Tam Kỳ</a>.</p>
`,
  },
];
