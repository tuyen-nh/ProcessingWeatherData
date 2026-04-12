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