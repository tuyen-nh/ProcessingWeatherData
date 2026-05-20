# Hướng Dẫn Chạy Hệ Thống

## Điều kiện: Docker đang chạy, JAR đã copy vào spark-master

---

## Terminal 1 — Kafka Producer (Windows)
> Gửi dữ liệu 34 tỉnh lên Kafka mỗi 2 phút. Để terminal này chạy liên tục.
```powershell
cd D:\2025.2\BigData\2026_1_big_data\BatchLayer_Hadoop
& 'C:\Program Files\Java\jdk-1.8\bin\java.exe' -cp 'target\batch-layer-hadoop-1.0-SNAPSHOT.jar' tn.insat.tp3.ApiToKafkaProducer
```

---

## Terminal 2 — Job 1: Batch Layer — Ghi dữ liệu vào HDFS
> Đọc Kafka → ghi Parquet lên HDFS mỗi 1 phút.
```powershell
docker exec -it spark-master /opt/spark/bin/spark-submit `
  --master spark://spark-master:7077 `
  --executor-cores 1 `
  --executor-memory 512m `
  --total-executor-cores 2 `
  --class tn.insat.tp3.KafkaToHDFSDumper `
  /opt/spark/app.jar
```

---

## Terminal 3 — Job 2: Stream Layer — Tính AQI → MongoDB
> Đọc Kafka → tính AQI theo cửa sổ 15 phút → ghi MongoDB Atlas.
```powershell
docker exec -it spark-master /opt/spark/bin/spark-submit `
  --master spark://spark-master:7077 `
  --executor-cores 1 `
  --executor-memory 512m `
  --total-executor-cores 2 `
  --class tn.insat.tp3.StreamingAQI `
  /opt/spark/app.jar
```

---

## Terminal 4 — Job 3: Batch Analytics — Xử lý dữ liệu lịch sử → MongoDB
> Đọc Parquet từ HDFS → tính thống kê 34 tỉnh → ghi MongoDB (BatchHistoricalAggregations, ProvinceAggregations).
> ⚠️ Chạy sau khi Job 1 (KafkaToHDFSDumper) đã ghi được dữ liệu vào HDFS.
```powershell
docker exec -it spark-master /opt/spark/bin/spark-submit `
  --master spark://spark-master:7077 `
  --executor-cores 1 `
  --executor-memory 512m `
  --total-executor-cores 2 `
  --class tn.insat.tp3.BatchWeatherAnalytics `
  /opt/spark/app.jar
```

---

## Kiểm Tra Kết Quả

| Mục | Lệnh / URL |
|---|---|
| Spark cluster & jobs | http://localhost:8080 |
| HDFS cluster & files | http://localhost:9870 |
| File trên HDFS | `docker exec namenode hdfs dfs -ls /user/data/raw/weather_data_stream/` |
| MongoDB | [cloud.mongodb.com](https://cloud.mongodb.com) → Big_Data → AQIStream |
| Log Spark | `docker logs -f spark-master` |

---

## Dừng Job
Nhấn `Ctrl+C` trong terminal đang chạy job.
