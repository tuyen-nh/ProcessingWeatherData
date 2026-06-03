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

## 7. Batch analytics (run after parquet exists in HDFS)

> Also runs automatically every day at 1 AM via the `batch-weather-analytics`
> CronJob (k8s/13-batch-cronjob.yaml) — this manual run is optional/on-demand.
> The CronJob reads the same jar from the `spark-app-jar` PVC, so step 3
> (load-and-run.sh) must have populated it first.
> Check / trigger manually:
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
