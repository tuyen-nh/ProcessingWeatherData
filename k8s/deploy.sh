#!/usr/bin/env bash
# Deploys the whole big-data stack to Kubernetes IN ORDER (dependencies respected).
# Run from project root:  bash k8s/deploy.sh
set -e
NS=bigdata
D=k8s

echo "==> namespace + config"
kubectl apply -f $D/00-namespace.yaml
kubectl apply -f $D/01-hadoop-configmap.yaml

echo "==> zookeeper"
kubectl apply -f $D/02-zookeeper-statefulset.yaml -f $D/03-zookeeper-service.yaml
kubectl wait --for=condition=ready pod/zookeeper-0 -n $NS --timeout=180s

echo "==> namenode"
kubectl apply -f $D/04-namenode-statefulset.yaml -f $D/05-namenode-service.yaml
kubectl wait --for=condition=ready pod/namenode-0 -n $NS --timeout=240s

echo "==> datanodes"
kubectl apply -f $D/06-datanode-statefulset.yaml -f $D/07-datanode-service.yaml

echo "==> kafka"
kubectl apply -f $D/08-kafka-statefulset.yaml -f $D/09-kafka-service.yaml
kubectl wait --for=condition=ready pod/kafka-0 -n $NS --timeout=240s

echo "==> spark master"
kubectl apply -f $D/10-spark-master-deployment.yaml -f $D/11-spark-master-service.yaml
kubectl wait --for=condition=ready pod -l app=spark-master -n $NS --timeout=180s

echo "==> spark workers"
kubectl apply -f $D/12-spark-worker-deployment.yaml

echo "==> done. Watch pods:"
kubectl get pods -n $NS
