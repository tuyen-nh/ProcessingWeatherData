#!/usr/bin/env bash
# After deploy.sh + all pods Running:
#   1) loads seed CSVs into HDFS
#   2) copies the built JAR into spark-master
# Run from project root:  bash k8s/load-and-run.sh
set -e
NS=bigdata
JAR=BatchLayer_Hadoop/target/batch-layer-hadoop-1.0-SNAPSHOT.jar

echo "==> load CSVs into HDFS"
kubectl cp vietnam_stations.csv $NS/namenode-0:/tmp/vietnam_stations.csv
kubectl cp BatchLayer_Hadoop/src/main/resources/export.csv $NS/namenode-0:/tmp/export.csv
kubectl exec namenode-0 -n $NS -- hdfs dfs -mkdir -p /user/data/static /user/data/raw/weather_data
kubectl exec namenode-0 -n $NS -- hdfs dfs -put -f /tmp/vietnam_stations.csv /user/data/static/
kubectl exec namenode-0 -n $NS -- hdfs dfs -put -f /tmp/export.csv /user/data/raw/weather_data/

echo "==> copy JAR into spark-master"
if [ ! -f "$JAR" ]; then
  echo "JAR not found. Build first:  (cd BatchLayer_Hadoop && mvn clean package -DskipTests)"
  exit 1
fi
POD=$(kubectl get pod -n $NS -l app=spark-master -o jsonpath='{.items[0].metadata.name}')
kubectl cp "$JAR" $NS/$POD:/opt/spark/app.jar
echo "==> JAR in pod $POD at /opt/spark/app.jar"
echo "Now run jobs — see k8s/RUN.md"
