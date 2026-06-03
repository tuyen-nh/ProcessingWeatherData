# Running the Weather Big-Data Stack on Kubernetes

> ⚠️ **Pick the right section for your OS:**
> 
> - **Linux / macOS (bash)** → use THIS section below. Line continuation = `\`,
>   set vars with `POD=$(...)` (no spaces around `=`).
> - **Windows (PowerShell)** → scroll down to the PowerShell section. Line
>   continuation = `` ` ``, set vars with `$POD = ...`.
> 
> Do NOT mix them — PowerShell `$POD = ...` and backtick `` ` `` fail in bash
> (you'll see `command not found` / `--master: command not found`).
> Xubuntu = Linux → use the bash section.

## 0. One-time install + start cluster

```bash
minikube start --memory=8192 --cpus=4 --driver=docker
kubectl get nodes        # should show 1 node "Ready"
```

## 1. Build the JAR (needs Maven + JDK 8)

```bash
cd BatchLayer_Hadoop && mvn clean package -DskipTests && cd ..
```

## 2. Deploy all infra (ordered, waits for readiness)

```bash
bash k8s/deploy.sh
kubectl get pods -n bigdata -w     # wait until ALL say Running, then Ctrl+C
```

## 3. Load CSVs into HDFS + copy JAR into Spark

```bash
bash k8s/load-and-run.sh
```

## 4. Get the spark-master pod name (used below)

> `$POD` only lives in the terminal where you run this. Each NEW terminal
> (steps 5, 6) needs its own `POD=...` line first — that's why the commands
> below repeat it. Run this once per terminal, or just use the full commands as-is.

```bash
POD=$(kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}')
echo $POD   # must be non-empty; if empty, spark-master not deployed (run k8s/deploy.sh)
```

## 5. Start the Producer (terminal A — leave running)

```bash
POD=$(kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it $POD -n bigdata -- java -cp /opt/spark/app/app.jar tn.insat.tp3.ApiToKafkaProducer
```

## 6. Start streaming jobs (each in its own terminal)

```bash
# TWO things every client-mode submit below needs:
#  1. spark.driver.host=$(hostname -i)  — driver runs INSIDE the spark-master
#     pod; without this it tells executors to dial the pod *hostname*, which is
#     NOT in k8s DNS -> "UnknownHostException" -> executors crash-loop (code 1)
#     -> "Initial job has not accepted any resources". The pod IP IS routable.
#     Must run via `bash -c '...'` so $(hostname -i) evaluates inside the pod.
#  2. --total-executor-cores / --executor-memory — cluster is tiny
#     (2 workers x 1024 MB = 2048 MB total); without caps the 1st job grabs
#     everything and the 2nd sits WAITING forever ("Initial job has not accepted
#     any resources"). RAM budget that fits all 3 jobs in 2048 MB:
#       dumper 512m + StreamingAQI 768m + batch 512m = 1792m  (OK)
#     StreamingAQI needs 768m because it runs 2 streams (raw + hourly window).
#
# After editing any .java: rebuild + re-copy the jar before re-running:
#   cd BatchLayer_Hadoop && mvn clean package -DskipTests && cd ..
#   POD=$(kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}')
#   kubectl cp BatchLayer_Hadoop/target/batch-layer-hadoop-1.0-SNAPSHOT.jar bigdata/${POD}:/opt/spark/app/app.jar

# terminal B — Kafka -> HDFS parquet
POD=$(kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it $POD -n bigdata -- bash -c '/opt/spark/bin/spark-submit \
  --master spark://spark-master:7077 --deploy-mode client \
  --conf spark.driver.host=$(hostname -i) \
  --total-executor-cores 1 --executor-memory 512m \
  --class tn.insat.tp3.KafkaToHDFSDumper /opt/spark/app/app.jar'

# terminal C — Kafka -> AQI -> MongoDB
# StreamingAQI chay 2 stream trong 1 app:
#   - RealTimeReadings  : snapshot moi nhat / tram (override _id = station_id)
#   - AQIStream_avg     : GOP 1 gio/tram (watermark 10'), timestamp +7 = gio VN.
#                         Day la nguon chart "xu huong nhiet 1 ngay" (/hourly).
# 2 stream + windowing can nhieu RAM hon -> dung 768m (512m co the OOM).
POD=$(kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it $POD -n bigdata -- bash -c '/opt/spark/bin/spark-submit \
  --master spark://spark-master:7077 --deploy-mode client \
  --conf spark.driver.host=$(hostname -i) \
  --total-executor-cores 1 --executor-memory 768m \
  --conf spark.jars.ivy=/tmp/.ivy2 \
  --packages org.mongodb.spark:mongo-spark-connector_2.12:3.0.1 \
  --class tn.insat.tp3.StreamingAQI /opt/spark/app/app.jar'
```

## 7. Batch analytics — ghi ProvinceAggregations + BatchHistoricalAggregations

> ⚠️ ĐIỀU KIỆN: HDFS `/user/data/raw/weather_data/` phải có CSV **theo trạm**
> (cột `station_id`,`time`,`temp`,`rhum`,`pm25`,`no2`). CSV gốc `export.csv`
> KHÔNG có `station_id` → batch gộp về station=null → ~8 doc rác (avg_aqi 0),
> ĐÈ chết data tốt. Sinh + nạp CSV chuẩn TRƯỚC (chạy 1 lần, cần internet):
> 
> ```bash
> cd ServingLayer_API && node scripts/genHdfsCsv.js && cd ..   # -> /tmp/weather_stations_30d.csv (24480 dong)
> kubectl cp /tmp/weather_stations_30d.csv bigdata/namenode-0:/tmp/weather_stations_30d.csv
> kubectl exec -n bigdata namenode-0 -- hdfs dfs -rm -f '/user/data/raw/weather_data/*'
> kubectl exec -n bigdata namenode-0 -- hdfs dfs -put -f /tmp/weather_stations_30d.csv /user/data/raw/weather_data/
> ```
> 
> Có CSV theo trạm rồi → batch ra **1020 doc** (30 ngày × 34 trạm) + **34 doc**
> tổng hợp, `date` lưu dạng string (khớp API `/daily`). CronJob 1h sáng
> (k8s/13-batch-cronjob.yaml, đã cap RAM 512m) chạy lại an toàn — đè tốt-bằng-tốt.
> Trigger tay:
> 
> ```bash
> kubectl get cronjob -n bigdata
> kubectl create job -n bigdata --from=cronjob/batch-weather-analytics batch-test
> kubectl logs -n bigdata job/batch-test -f
> ```

```bash
POD=$(kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it $POD -n bigdata -- bash -c '/opt/spark/bin/spark-submit \
  --master spark://spark-master:7077 --deploy-mode client \
  --conf spark.driver.host=$(hostname -i) \
  --total-executor-cores 1 --executor-memory 512m \
  --conf spark.jars.ivy=/tmp/.ivy2 \
  --packages org.mongodb.spark:mongo-spark-connector_2.12:3.0.1 \
  --class tn.insat.tp3.BatchWeatherAnalytics /opt/spark/app/app.jar'
```

## 8. Open the web UIs

```bash
minikube service namenode -n bigdata       # HDFS — browse data
minikube service spark-master -n bigdata   # Spark — watch jobs
```

## 9. Serving API (Node) — phục vụ data cho web

> Đọc 4 collection Mongo (AQIStream_avg, RealTimeReadings, ProvinceAggregations,
> BatchHistoricalAggregations). Cần file `ServingLayer_API/.env` có `MONGO_URI` (+ `PORT` tùy chọn).

```bash
cd ServingLayer_API
npm install            # lần đầu
npm start              # http://localhost:3000  (Ctrl+C để dừng)
cd ..
```

## 10. (Tùy chọn) Fill data batch NHANH — không cần Spark/HDFS

> `ProvinceAggregations` + `BatchHistoricalAggregations` có 2 cách điền:
>   A. **Spark batch** (step 7) — đúng kiến trúc Lambda, là cái CronJob 1h sáng chạy.
>   B. **fillBatch.js** (dưới đây) — Node kéo thẳng Open-Meteo -> Mongo, KHÔNG cần
>      HDFS/Spark. Nhanh, tiện khi chỉ muốn data cho web mà không dựng cả cluster.
> Cả hai cho cùng kết quả (1020 + 34, `date` string). KHÔNG đụng
> AQIStream_avg/RealTimeReadings. Chạy lại bất cứ lúc nào để làm tươi.

```bash
cd ServingLayer_API
node scripts/fillBatch.js     # -> ProvinceAggregations 1020 doc + BatchHistorical 34
cd ..
```

> Lưu ý: KHÔNG chạy lẫn lộn — nếu CronJob Spark (step 7) chạy SAU fillBatch, nó
> ghi đè lại (vẫn data tốt nếu HDFS đã có CSV theo trạm — step 7). Dùng A hoặc B
> nhất quán.

## 10b. Fill chart "Diễn biến trong ngày" hôm nay (KHÔNG cần treo máy)

> Chart giờ-theo-ngày đọc `AQIStream_avg` — chỉ đầy khi StreamingAQI chạy live.
> Để có đủ giờ 00:00 → giờ hiện tại MÀ KHÔNG treo máy cả đêm, seed thẳng từ
> Open-Meteo (giờ VN, cùng `_id`/shape streaming). UPSERT theo `_id` nên KHÔNG
> xóa data live; nếu sau đó chạy stream, nó ghi đè đúng giờ.

```bash
cd ServingLayer_API
node scripts/fillToday.js     # -> AQIStream_avg gio 00:00..hien tai hom nay (34 tram)
cd ..
```

> Chạy lại mỗi lần mở web nếu muốn chart cập nhật tới giờ hiện tại. Muốn data
> CẬP NHẬT REAL-TIME tới từng phút thì mới cần chạy StreamingAQI (step 6) — còn
> chỉ cần "đầy theo giờ" thì script này đủ, khỏi treo máy/stream.

## 10c. Fill TẤT CẢ data web bằng 1 lệnh (npm scripts)

> Gộp fillBatch (chart theo NGÀY) + fillToday (chart trong NGÀY). Tiện khi chỉ
> muốn web có data đầy đủ mà không dựng cluster/stream. KHÔNG cần Spark/HDFS/treo máy.

```bash
cd ServingLayer_API
npm run fill:all       # = fillBatch.js + fillToday.js
# hoac rieng le:
#   npm run fill:batch  -> ProvinceAggregations 1020 + BatchHistorical 34 (chart NGAY)
#   npm run fill:today  -> AQIStream_avg 0h..hien tai     (chart trong NGAY)
cd ..
```

> Luồng nhanh nhất để xem web (không cluster): `npm run fill:all` → `npm start`
> (step 9) → frontend `npm run dev` (step 11). Xong, có data ngay.

## 11. Frontend (Vite) — xem biểu đồ

> Đọc API ở `http://localhost:3000` (đổi qua `VITE_API_BASE` nếu cần). Serving API
> (step 9) phải đang chạy.

```bash
cd frontend
npm install            # lần đầu
npm run dev            # http://localhost:5173
cd ..
```

## Debug

```bash
kubectl get pods -n bigdata
kubectl logs <pod> -n bigdata
kubectl describe pod <pod> -n bigdata
kubectl exec -it namenode-0 -n bigdata -- hdfs dfsadmin -report
```

## Reset everything

```bash
kubectl delete namespace bigdata     # deletes all pods + data
```

<!-- $env:PATH += ";C:\Program Files\Kubernetes\Minikube"; minikube dashboard  -->

%  đây là câu lệnh để run dashboard trong power shell
---

---

# Running the Weather Big-Data Stack on Kubernetes (Windows PowerShell)

> ⚠️ All commands below are for **PowerShell** on Windows.
> Keep each terminal open while the job is running.

---

## ✅ Prerequisites (one-time setup)

- Docker Desktop installed and running
- Minikube installed (`winget install Kubernetes.minikube`)
- kubectl installed (`winget install Kubernetes.kubectl`)
- Maven + JDK 8 installed

---

## STEP 0 — Fix PATH (run in every new PowerShell window)

```powershell
$env:PATH += ";C:\Program Files\Kubernetes\Minikube"
```

> This is needed because VS Code terminal doesn't auto-reload PATH after install.

---

## STEP 1 — Start Minikube cluster (one-time or after reboot)

```powershell
minikube start --memory=6144 --cpus=4 --driver=docker
kubectl get nodes    # should show: minikube   Ready
```

---

## STEP 2 — Deploy all infrastructure to Kubernetes

```powershell
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-hadoop-configmap.yaml
kubectl apply -f k8s/02-zookeeper-statefulset.yaml -f k8s/03-zookeeper-service.yaml
kubectl apply -f k8s/04-namenode-statefulset.yaml  -f k8s/05-namenode-service.yaml
kubectl apply -f k8s/06-datanode-statefulset.yaml  -f k8s/07-datanode-service.yaml
kubectl apply -f k8s/08-kafka-statefulset.yaml     -f k8s/09-kafka-service.yaml
kubectl apply -f k8s/09b-spark-app-pvc.yaml
kubectl apply -f k8s/10-spark-master-deployment.yaml -f k8s/11-spark-master-service.yaml
kubectl apply -f k8s/12-spark-worker-deployment.yaml
kubectl apply -f k8s/13-batch-cronjob.yaml
```

Watch until all pods say `Running`:

```powershell
kubectl get pods -n bigdata -w
# Press Ctrl+C when all show 1/1 Running
```

---

## STEP 3 — Build the JAR

```powershell
cd D:\2025.2\BigData\2026_1_big_data\BatchLayer_Hadoop
mvn clean package -DskipTests
cd ..
```

Output JAR: `BatchLayer_Hadoop/target/batch-layer-hadoop-1.0-SNAPSHOT.jar`

---

## STEP 4 — Load data into HDFS + copy JAR to Spark pod

```powershell
# Upload CSV files to HDFS
kubectl cp vietnam_stations.csv bigdata/namenode-0:/tmp/vietnam_stations.csv
kubectl cp BatchLayer_Hadoop/src/main/resources/export.csv bigdata/namenode-0:/tmp/export.csv
kubectl exec namenode-0 -n bigdata -- hdfs dfs -mkdir -p /user/data/static /user/data/raw/weather_data
kubectl exec namenode-0 -n bigdata -- hdfs dfs -put -f /tmp/vietnam_stations.csv /user/data/static/
kubectl exec namenode-0 -n bigdata -- hdfs dfs -put -f /tmp/export.csv /user/data/raw/weather_data/

# Copy JAR into spark-master pod
$POD = kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}'
kubectl cp "BatchLayer_Hadoop/target/batch-layer-hadoop-1.0-SNAPSHOT.jar" bigdata/${POD}:/opt/spark/app/app.jar
```

---

## STEP 5 — Get Spark Master pod name (run before steps 6-8)

```powershell
$POD = kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}'
echo $POD
```

---

## STEP 6 — Start Producer (Terminal A — keep running)

```powershell
kubectl exec -it $POD -n bigdata -- java -cp /opt/spark/app/app.jar tn.insat.tp3.ApiToKafkaProducer
```

---

## STEP 7 — Start Streaming jobs (each in its own terminal)

# NOTE: cluster is tiny (2 workers x 1024 MB). By default each Spark app grabs

# ALL cores + memory, so the 2nd streaming job sits WAITING forever

# ("Initial job has not accepted any resources"). Cap every long-running job

# with --total-executor-cores + --executor-memory so they coexist.

> Note: driver runs inside the pod, so `$(hostname -i)` must evaluate there —
> the whole spark-submit is passed as ONE single-quoted arg to `bash -c`.

**Terminal B — Kafka → HDFS (raw data lake):**

```powershell
kubectl exec -it $POD -n bigdata -- bash -c '/opt/spark/bin/spark-submit --master spark://spark-master:7077 --deploy-mode client --conf spark.driver.host=$(hostname -i) --total-executor-cores 1 --executor-memory 512m --class tn.insat.tp3.KafkaToHDFSDumper /opt/spark/app/app.jar'
```

**Terminal C — Kafka → AQI → MongoDB (speed layer):**

```powershell
kubectl exec -it $POD -n bigdata -- bash -c '/opt/spark/bin/spark-submit --master spark://spark-master:7077 --deploy-mode client --conf spark.driver.host=$(hostname -i) --total-executor-cores 1 --executor-memory 768m --conf spark.jars.ivy=/tmp/.ivy2 --packages org.mongodb.spark:mongo-spark-connector_2.12:3.0.1 --class tn.insat.tp3.StreamingAQI /opt/spark/app/app.jar'
```

---

## STEP 8 — Batch analytics (run after parquet data exists in HDFS)

```powershell
kubectl exec -it $POD -n bigdata -- bash -c '/opt/spark/bin/spark-submit --master spark://spark-master:7077 --deploy-mode client --conf spark.driver.host=$(hostname -i) --total-executor-cores 1 --executor-memory 512m --conf spark.jars.ivy=/tmp/.ivy2 --packages org.mongodb.spark:mongo-spark-connector_2.12:3.0.1 --class tn.insat.tp3.BatchWeatherAnalytics /opt/spark/app/app.jar'
```

---

## STEP 9 — Open Visual Dashboard

```powershell
# Keep this terminal open — dashboard stops if you close it
$env:PATH += ";C:\Program Files\Kubernetes\Minikube"
minikube dashboard
# Browser opens automatically → change namespace to "bigdata" → click Pods
```

---

## 🔧 Useful Debug Commands

```powershell
kubectl get pods -n bigdata                          # list all pods
kubectl logs <pod-name> -n bigdata                   # view pod logs
kubectl describe pod <pod-name> -n bigdata           # pod details & errors
kubectl exec -it namenode-0 -n bigdata -- hdfs dfsadmin -report  # HDFS status
```

---

## 🗑️ Reset Everything

```powershell
kubectl delete namespace bigdata    # deletes ALL pods + data
# To redeploy, start again from STEP 2
```

$POD = kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}'
kubectl exec -it $POD -n bigdata -- java -cp /opt/spark/app/app.jar tn.insat.tp3.ApiToKafkaProducer
