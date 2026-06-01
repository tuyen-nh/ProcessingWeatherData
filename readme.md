
                    Phân tích thời tiết và chất lượng không khí Việt Nam 
In a real production system, there is usually a Producer (a piece of code, like a Python script or a Java app) that fetches the crypto prices from an API. It sends that data to Kafka.

From Kafka, the data "fans out" (replicates) into two parallel tracks:

1. The "Storage" Track (To HDFS)
The Action: Kafka sends a copy of every single message to HDFS.

The Result: Your HDFS "Data Lake" grows bigger every second. It already has the 200 days of history, and now it is adding "Today" to the pile.

The Goal: To make sure that tomorrow, when the Hadoop Batch Job runs, it has a complete record of everything that happened today.

2. The "Speed" Track (To Spark)
The Action: At the exact same time, Kafka sends another copy of that same message to Spark Streaming.

The Result: Spark doesn't care about the 200 days of history right now. It only cares about the last 10 seconds or 1 minute.

The Goal: To update the "Live Price" on your dashboard immediately so the user doesn't have to wait for a Hadoop job to finish.



dataset real-time for hdfs : https://meteostat.net/en/place/vn/hanoi?s=48820&t=2026-03-27/2026-04-03

# sóa 1 file từ hdfs 
docker exec -it namenode hdfs dfs -rm -r -skipTrash /user/data/raw/weather_data

# tạo một thư mục mới 
docker exec -it namenode hdfs dfs -mkdir -p /user/data/raw/weather_data

# Xem danh sách các file trong thư mục:
docker exec -it namenode hdfs dfs -ls /user/data/raw/weather_data/

# Xem nội dung bên trong file (Hiển thị 10 dòng đầu tiên):
docker exec -it namenode hdfs dfs -cat /user/data/raw/weather_data/export.csv | Select-Object -First 10
 
 các lệnh để đẩy 1 file vào hdfs trong docker
docker cp ./vietnam_stations.csv namenode:/tmp/vietnam_stations.csv
docker exec -it namenode hdfs dfs -put /tmp/vietnam_stations.csv /user/data/static/

website xem dữ liệu thật trên hdfs
http://localhost:9870/explorer.html#/user/data/raw/weather_data

nơi lấy api thời tiết 
https://www.weatherapi.com/my/fields.aspx


mongodb+srv://tuyen:tuyen@cluster0.tkzrw9q.mongodb.net/Big_Data?appName=Cluster0

---

## 📊 System Configuration (K8s)

### 🟠 Kafka — `k8s/08-kafka-statefulset.yaml`

| Parameter                        | Value                                            |
|----------------------------------|--------------------------------------------------|
| **Number of Brokers**            | **3** (replicas: 3 → kafka-0, kafka-1, kafka-2) |
| **Default Partitions per Topic** | **3** (KAFKA_NUM_PARTITIONS: "3")              |
| **Default Replication Factor**   | 2 (KAFKA_DEFAULT_REPLICATION_FACTOR: "2")      |
| **Offsets Topic Replication**    | 3 (KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "3")|
| **Storage per Broker**           | 5Gi                                              |

> Each broker automatically gets its ID from the pod name (`kafka-0` → ID 0, `kafka-1` → ID 1, `kafka-2` → ID 2)

---

### ⚡ Spark — `k8s/10-spark-master-deployment.yaml` & `k8s/12-spark-worker-deployment.yaml`

| Component         | Count | Resources                             |
|-------------------|-------|---------------------------------------|
| **Spark Master**  | 1     | —                                     |
| **Spark Workers** | **2** (`replicas: 2`) | RAM: 1–2Gi / CPU: 0.5–1 core each |

---

### 🗂️ Quick Summary

```
Kafka:   3 brokers  |  3 partitions (default)  |  replication factor = 2
Spark:   1 master   |  2 workers
```

