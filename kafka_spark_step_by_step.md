# Hướng Dẫn Từng Bước: Cài Đặt Kafka và Xử Lý Dữ Liệu Bằng Spark Streaming

Dưới đây là tài liệu hướng dẫn step-by-step để bạn có thể tự mình khởi chạy Kafka, tích hợp với code Spark Streaming (Java) của bạn và lưu kết quả vào MongoDB.

---

## Bước 1: Khởi động Kafka Environment

Kafka cần Zookeeper đi kèm để quản lý cụm. Nếu bạn chưa cài đặt, hãy tải bản Kafka mới nhất (đã tích hợp sẵn Zookeeper) từ trang chủ Apache Kafka, giải nén và mở terminal (hoặc Command Prompt) tại thư mục Kafka.

### 1.1 Khởi động Zookeeper
Mở một terminal mới và chạy lệnh sau (đừng tắt terminal này):
**Windows:**
```cmd
.\bin\windows\zookeeper-server-start.bat .\config\zookeeper.properties
```
**Linux/Mac:**
```bash
bin/zookeeper-server-start.sh config/zookeeper.properties
```

### 1.2 Khởi động Kafka Broker
Mở terminal thứ hai và chạy lệnh sau:
**Windows:**
```cmd
.\bin\windows\kafka-server-start.bat .\config\server.properties
```
**Linux/Mac:**
```bash
bin/kafka-server-start.sh config/server.properties
```

### 1.3 Tạo Kafka Topic
Mở terminal thứ ba để tạo một topic (kênh giao tiếp) tên là `market_data` để chứa dữ liệu:
**Windows:**
```cmd
.\bin\windows\kafka-topics.bat --create --topic market_data --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1
```
**Linux/Mac:**
```bash
bin/kafka-topics.sh --create --topic market_data --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1
```

---

## Bước 2: Cấu Hình Dự Án Maven (pom.xml)

Trong dự án `BatchLayer_Hadoop` (hoặc tạo một dự án mới), bạn cần phải đảm bảo file `pom.xml` có đầy đủ các thư viện (`dependencies`) để chạy Spark, Kafka và MongoDB.

Mở `pom.xml` và thêm các dependency sau vào bên trong thẻ `<dependencies>`:

```xml
        <!-- Spark Core -->
        <dependency>
            <groupId>org.apache.spark</groupId>
            <artifactId>spark-core_2.12</artifactId>
            <version>3.3.2</version> 
        </dependency>

        <!-- Spark Streaming -->
        <dependency>
            <groupId>org.apache.spark</groupId>
            <artifactId>spark-streaming_2.12</artifactId>
            <version>3.3.2</version>
        </dependency>

        <!-- Spark Streaming Kafka (Lưu ý: Bạn đang dùng KafkaUtils của phiên bản cũ, 
             có thể cần thư viện spark-streaming-kafka-0-8_2.11 nếu dùng mã cũ,
             nhưng ở đây là ví dụ thư viện chuẩn) -->
        <dependency>
            <groupId>org.apache.spark</groupId>
            <artifactId>spark-streaming-kafka-0-10_2.12</artifactId>
            <version>3.3.2</version>
        </dependency>

        <!-- MongoDB Java Driver (Vì code của bạn dùng MongoClient trực tiếp) -->
        <dependency>
            <groupId>org.mongodb</groupId>
            <artifactId>mongodb-driver-sync</artifactId>
            <version>4.9.0</version>
        </dependency>

        <!-- JSON Parser (Dùng để đọc JSON từ API thực) -->
        <dependency>
            <groupId>org.json</groupId>
            <artifactId>json</artifactId>
            <version>20230227</version>
        </dependency>
```
*Lưu ý: Hãy "Reload Project" (trong IntelliJ) hoặc `mvn clean install` để tải các thư viện này về máy.*

---

## Bước 3: Đưa Code Java Vào Dự Án

1. Trong thư mục `src/main/java/`, hãy tạo các package theo đường dẫn thư mục: `tn/insat/tp3/`.
2. Tạo file `SparkKafkaWordCount.java` nằm trong package đó.
3. Dán toàn bộ đoạn code Java xử lý (chứa class `Record` và `SparkKafkaWordCount`) mà bạn đã cung cấp vào file này.

---

## Bước 4: Chạy Và Kiểm Tra Kết Quả (Testing)

### 4.1 Chạy Spark Streaming Application
Sử dụng IDE của bạn (IntelliJ, Eclipse...) để chạy hàm `main()` của class `SparkKafkaWordCount`.
**Quan trọng:** Vì chương trình của bạn yêu cầu tham số đầu vào (`args`), bạn cần phải cấu hình "Program Arguments" trong IDE:
```text
localhost:2181 my-consumer-group market_data 1
```
*(Ý nghĩa: `localhost:2181` là địa chỉ Zookeeper, `my-consumer-group` là tên nhóm, `market_data` là topic, `1` là số theards)*

### 4.2 Cung Cấp Dữ Liệu Thực Từ Mạng (Java API Producer)
Thay vì tự gõ tay dữ liệu, bạn có thể tạo một đoạn code Java độc lập trong dự án của mình để làm công việc "Producer" - cứ mỗi 3 giây đi gọi API Bitcoin thực tế, sau đó tự động ném chuỗi CSV vào Kafka cho Spark xử lý.

1. Hãy tạo thêm file **`ApiToKafkaProducer.java`** chung package với file Spark của bạn.
2. Dán đoạn code sau vào:

```java
package tn.insat.tp3;

import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Properties;

public class ApiToKafkaProducer {

    public static void main(String[] args) {
        // 1. Cấu hình Kafka Producer
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");

        Producer<String, String> producer = new KafkaProducer<>(props);
        String topic = "market_data";

        System.out.println("Bắt đầu lấy dữ liệu API thực và đẩy vào Kafka...");

        // 2. Vòng lặp liên tục gọi API
        while (true) {
            try {
                // Gọi tới API tiền ảo công khai Coincap
                URL url = new URL("https://api.coincap.io/v2/assets/bitcoin");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");

                BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                String inputLine;
                StringBuilder content = new StringBuilder();
                while ((inputLine = in.readLine()) != null) {
                    content.append(inputLine);
                }
                in.close();
                conn.disconnect();

                // Chuyển kết quả sang mã JSON
                JSONObject jsonResponse = new JSONObject(content.toString());
                JSONObject data = jsonResponse.getJSONObject("data");

                // 3. Rút trích các trường yêu cầu
                long timestamp = System.currentTimeMillis();
                int coinId = 101; 
                double vwap = data.optDouble("vwap24Hr", 0.0);
                double price = data.optDouble("priceUsd", 0.0);
                double high = price + 5.0; // Giả lập mức high
                double low = price - 5.0;  // Giả lập mức low
                double count = 1.0;

                // 4. Khớp với cấu trúc mảng CSV mà mã Spark của bạn (SparkKafkaWordCount) muốn:
                // word[0]=time, word[1]=id, word[2]=count, word[4]=high, word[5]=low, word[8]=vwap
                // Khuôn dạng do đó phải là: time, id, count, 0, high, low, 0, 0, vwap
                String csvMessage = String.format("%d, %d, %s, 0, %s, %s, 0, 0, %s", 
                                       timestamp, coinId, count, high, low, vwap);

                // 5. Bắn Message này lên kênh Topic Kafka
                producer.send(new ProducerRecord<>(topic, csvMessage));
                System.out.println("Đã gửi API Data rành công: " + csvMessage);

                // Chờ 3 giây trước lần chọc API kế tiếp
                Thread.sleep(3000);

            } catch (Exception e) {
                System.err.println("Lỗi khi kết nối API: " + e.getMessage());
            }
        }
    }
}
```

3. **Chạy song song:** Khi chạy ứng dụng thực tiễn, bạn nhấn nút Run cho **`SparkKafkaWordCount`** trước, sau đó Mở Tab/Cửa sổ mới chạy Run cho hàm main của **`ApiToKafkaProducer`**. Data sẽ tự chuyển động!

### 4.3 Xem Kết Quả Trong MongoDB
Chương trình Spark sẽ bắt các dòng chữ CSV đó (trong mỗi 1s batch), parse nó thành đối tượng `Record` và sau đó đẩy nó lên Cluster MongoDB (`cluster0.ymh6fip.mongodb.net`).
- Hãy tải phần mềm **MongoDB Compass** (hoặc truy cập trực tiếp web MongoDB Atlas).
- Kết nối bằng chuỗi Conection String của bạn: `mongodb+srv://sborcheni:XHJJVDb8SrAOfmig@cluster0.ymh6fip.mongodb.net/`
- Mở Database tên là **`BigData`**
- Mở Collection tên là **`samer`**
- Bạn sẽ thấy các Document mới nhất với mảng JSON chứa `vwap`, `high`, `low` chuẩn xác!
